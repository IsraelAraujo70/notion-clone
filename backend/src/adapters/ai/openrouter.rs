use std::{collections::BTreeMap, time::Duration};

use async_trait::async_trait;
use futures_util::StreamExt;
use serde_json::{Value, json};
use tokio::sync::mpsc;

use crate::application::ports::ai::*;

const PROVIDER_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const PROVIDER_STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(20);
const EMBEDDING_TIMEOUT: Duration = Duration::from_secs(50);

pub struct OpenRouterAiProvider {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
}

#[derive(Default)]
struct PendingToolCall {
    id: String,
    name: String,
    arguments: String,
}

struct ParsedSseData {
    deltas: Vec<AiStreamDelta>,
    terminal: bool,
}

impl OpenRouterAiProvider {
    pub fn new(api_key: String, base_url: String) -> Self {
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .build()
                .expect("valid reqwest client configuration"),
            api_key,
            base_url: base_url.trim_end_matches('/').into(),
        }
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value, AiProviderError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .timeout(EMBEDDING_TIMEOUT)
            .send()
            .await
            .map_err(|_| AiProviderError::Unavailable)?;
        check_status(response.status())?;
        response
            .json()
            .await
            .map_err(|_| AiProviderError::InvalidResponse)
    }
}

fn check_status(status: reqwest::StatusCode) -> Result<(), AiProviderError> {
    if status.as_u16() == 429 {
        Err(AiProviderError::RateLimited)
    } else if status.is_success() {
        Ok(())
    } else {
        Err(AiProviderError::Unavailable)
    }
}

fn chat_body(request: &AiChatRequest) -> Value {
    let messages = request
        .messages
        .iter()
        .map(|message| {
            let mut value = json!({
                "role": match message.role {
                    AiRole::System => "system",
                    AiRole::User => "user",
                    AiRole::Assistant => "assistant",
                    AiRole::Tool => "tool",
                },
                "content": message.content,
            });
            if !message.tool_calls.is_empty() {
                value["tool_calls"] = Value::Array(
                    message
                        .tool_calls
                        .iter()
                        .map(|call| json!({
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.name, "arguments": call.arguments.to_string()}
                        }))
                        .collect(),
                );
            }
            if let Some(id) = &message.tool_call_id {
                value["tool_call_id"] = json!(id);
            }
            value
        })
        .collect::<Vec<_>>();
    let tools = request
        .tools
        .iter()
        .map(|tool| json!({
            "type":"function",
            "function":{"name":tool.name,"description":tool.description,"parameters":tool.parameters}
        }))
        .collect::<Vec<_>>();
    json!({"model":request.model,"messages":messages,"tools":tools,"stream":true,"stream_options":{"include_usage":true}})
}

fn parse_sse_data(
    data: &str,
    pending: &mut BTreeMap<u64, PendingToolCall>,
) -> Result<ParsedSseData, AiProviderError> {
    if data == "[DONE]" {
        return Ok(ParsedSseData {
            deltas: finish_tool_calls(pending)?,
            terminal: true,
        });
    }
    let value: Value = serde_json::from_str(data).map_err(|_| AiProviderError::InvalidResponse)?;
    let mut deltas = Vec::new();
    if let Some(text) = value["choices"][0]["delta"]["content"].as_str()
        && !text.is_empty()
    {
        deltas.push(AiStreamDelta::Text(text.to_string()));
    }
    if let Some(calls) = value["choices"][0]["delta"]["tool_calls"].as_array() {
        for call in calls {
            let index = call["index"]
                .as_u64()
                .ok_or(AiProviderError::InvalidResponse)?;
            let item = pending.entry(index).or_default();
            if let Some(id) = call["id"].as_str() {
                item.id.push_str(id);
            }
            if let Some(name) = call["function"]["name"].as_str() {
                item.name.push_str(name);
            }
            if let Some(arguments) = call["function"]["arguments"].as_str() {
                item.arguments.push_str(arguments);
            }
        }
    }
    let terminal = match value["choices"][0]["finish_reason"].as_str() {
        Some("tool_calls") => {
            deltas.extend(finish_tool_calls(pending)?);
            true
        }
        Some("stop") => {
            if !pending.is_empty() {
                return Err(AiProviderError::InvalidResponse);
            }
            true
        }
        Some(_) => return Err(AiProviderError::InvalidResponse),
        None => false,
    };
    if !value["usage"].is_null() {
        deltas.push(AiStreamDelta::Usage(AiUsage {
            prompt_tokens: value["usage"]["prompt_tokens"].as_u64().unwrap_or(0),
            completion_tokens: value["usage"]["completion_tokens"].as_u64().unwrap_or(0),
        }));
    }
    Ok(ParsedSseData { deltas, terminal })
}

fn finish_tool_calls(
    pending: &mut BTreeMap<u64, PendingToolCall>,
) -> Result<Vec<AiStreamDelta>, AiProviderError> {
    std::mem::take(pending)
        .into_values()
        .map(|call| {
            if call.id.is_empty() || call.name.is_empty() {
                return Err(AiProviderError::InvalidResponse);
            }
            let arguments = serde_json::from_str(&call.arguments)
                .map_err(|_| AiProviderError::InvalidResponse)?;
            Ok(AiStreamDelta::ToolCall(AiToolCall {
                id: call.id,
                name: call.name,
                arguments,
            }))
        })
        .collect()
}

fn validate_stream_end(terminal: bool) -> Result<(), AiProviderError> {
    terminal
        .then_some(())
        .ok_or(AiProviderError::InvalidResponse)
}

#[async_trait]
impl AiProvider for OpenRouterAiProvider {
    async fn chat_stream(&self, request: AiChatRequest) -> Result<AiStream, AiProviderError> {
        let response = tokio::time::timeout(
            PROVIDER_REQUEST_TIMEOUT,
            self.client
                .post(format!("{}/chat/completions", self.base_url))
                .bearer_auth(&self.api_key)
                .json(&chat_body(&request))
                .send(),
        )
        .await
        .map_err(|_| AiProviderError::Unavailable)?
        .map_err(|_| AiProviderError::Unavailable)?;
        check_status(response.status())?;

        let (tx, rx) = mpsc::channel(32);
        tokio::spawn(async move {
            let mut bytes = response.bytes_stream();
            let mut buffer = Vec::new();
            let mut pending = BTreeMap::new();
            let mut terminal = false;
            loop {
                let chunk =
                    match tokio::time::timeout(PROVIDER_STREAM_IDLE_TIMEOUT, bytes.next()).await {
                        Ok(Some(chunk)) => chunk,
                        Ok(None) => break,
                        Err(_) => {
                            let _ = tx.send(Err(AiProviderError::Unavailable)).await;
                            return;
                        }
                    };
                let chunk = match chunk {
                    Ok(value) => value,
                    Err(_) => {
                        let _ = tx.send(Err(AiProviderError::Unavailable)).await;
                        return;
                    }
                };
                buffer.extend_from_slice(&chunk);
                while let Some((end, delimiter_len)) = sse_frame_end(&buffer) {
                    let frame = match std::str::from_utf8(&buffer[..end]) {
                        Ok(value) => value.replace('\r', ""),
                        Err(_) => {
                            let _ = tx.send(Err(AiProviderError::InvalidResponse)).await;
                            return;
                        }
                    };
                    buffer.drain(..end + delimiter_len);
                    for data in frame
                        .lines()
                        .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
                    {
                        match parse_sse_data(data, &mut pending) {
                            Ok(parsed) => {
                                terminal |= parsed.terminal;
                                for delta in parsed.deltas {
                                    if tx.send(Ok(delta)).await.is_err() {
                                        return;
                                    }
                                }
                            }
                            Err(error) => {
                                let _ = tx.send(Err(error)).await;
                                return;
                            }
                        }
                    }
                }
            }
            if let Err(error) = validate_stream_end(terminal) {
                let _ = tx.send(Err(error)).await;
            }
        });
        Ok(rx)
    }

    async fn embed(
        &self,
        model: &str,
        inputs: &[String],
    ) -> Result<Vec<Vec<f32>>, AiProviderError> {
        let value = self
            .post("/embeddings", json!({"model":model,"input":inputs}))
            .await?;
        value["data"]
            .as_array()
            .ok_or(AiProviderError::InvalidResponse)?
            .iter()
            .map(|item| {
                item["embedding"]
                    .as_array()
                    .ok_or(AiProviderError::InvalidResponse)?
                    .iter()
                    .map(|number| {
                        number
                            .as_f64()
                            .map(|value| value as f32)
                            .ok_or(AiProviderError::InvalidResponse)
                    })
                    .collect()
            })
            .collect()
    }

    fn name(&self) -> &'static str {
        "openrouter"
    }
}

fn sse_frame_end(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|at| (at, 2));
    let crlf = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|at| (at, 4));
    match (lf, crlf) {
        (Some(left), Some(right)) => Some(if left.0 < right.0 { left } else { right }),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_assistant_and_parallel_tool_results_with_protocol_ids() {
        let calls = vec![
            AiToolCall {
                id: "a".into(),
                name: "read_context".into(),
                arguments: json!({}),
            },
            AiToolCall {
                id: "b".into(),
                name: "search_context".into(),
                arguments: json!({}),
            },
        ];
        let body = chat_body(&AiChatRequest {
            model: "model".into(),
            messages: vec![
                AiMessage {
                    role: AiRole::Assistant,
                    content: String::new(),
                    tool_calls: calls,
                    tool_call_id: None,
                },
                AiMessage {
                    role: AiRole::Tool,
                    content: "context".into(),
                    tool_calls: vec![],
                    tool_call_id: Some("a".into()),
                },
                AiMessage {
                    role: AiRole::Tool,
                    content: "results".into(),
                    tool_calls: vec![],
                    tool_call_id: Some("b".into()),
                },
            ],
            tools: vec![],
        });
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["tool_calls"][1]["id"], "b");
        assert_eq!(body["messages"][1]["role"], "tool");
        assert_eq!(body["messages"][1]["tool_call_id"], "a");
    }

    #[test]
    fn accumulates_parallel_tool_call_fragments() {
        let mut pending = BTreeMap::new();
        parse_sse_data(r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"read_","arguments":"{"}},{"index":1,"id":"b","function":{"name":"search_context","arguments":"{}"}}]}}]}"#, &mut pending).unwrap();
        let deltas = parse_sse_data(r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"context","arguments":"}"}}]},"finish_reason":"tool_calls"}]}"#, &mut pending).unwrap().deltas;
        assert!(
            matches!(&deltas[0], AiStreamDelta::ToolCall(call) if call.id == "a" && call.name == "read_context")
        );
        assert!(matches!(&deltas[1], AiStreamDelta::ToolCall(call) if call.id == "b"));
    }

    #[test]
    fn detects_lf_and_crlf_sse_frames() {
        assert_eq!(sse_frame_end(b"data: one\n\ndata:"), Some((9, 2)));
        assert_eq!(sse_frame_end(b"data: one\r\n\r\ndata:"), Some((9, 4)));
    }

    #[test]
    fn premature_eof_is_not_terminal_and_does_not_finish_tool_calls() {
        let mut pending = BTreeMap::new();
        let parsed = parse_sse_data(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"apply_operations","arguments":"{\"operations\":["}}]}}]}"#,
            &mut pending,
        )
        .unwrap();
        assert!(!parsed.terminal);
        assert!(parsed.deltas.is_empty());
        assert_eq!(pending.len(), 1);
        assert_eq!(
            validate_stream_end(parsed.terminal),
            Err(AiProviderError::InvalidResponse)
        );
    }

    #[test]
    fn done_is_an_explicit_terminal_marker() {
        let mut pending = BTreeMap::new();
        let parsed = parse_sse_data("[DONE]", &mut pending).unwrap();
        assert!(parsed.terminal);
    }
}
