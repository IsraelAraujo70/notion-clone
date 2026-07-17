use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::header::{AUTHORIZATION, ORIGIN, WWW_AUTHENTICATE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::integration::{IntegrationPrincipal, IntegrationScope};
use crate::bootstrap::state::AppState;
use crate::domain::block::Operation;

const PROTOCOL_VERSION: &str = "2025-06-18";
const MAX_OPERATIONS_PER_CALL: usize = 50;

pub struct McpPrincipal(pub IntegrationPrincipal);

pub struct McpAuthError;

impl IntoResponse for McpAuthError {
    fn into_response(self) -> Response {
        let mut response = StatusCode::UNAUTHORIZED.into_response();
        response.headers_mut().insert(
            WWW_AUTHENTICATE,
            HeaderValue::from_static("Bearer realm=\"reason-mcp\""),
        );
        response
    }
}

impl FromRequestParts<AppState> for McpPrincipal {
    type Rejection = McpAuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or(McpAuthError)?;
        state
            .integrations
            .authenticate(token)
            .await
            .map(Self)
            .map_err(|_| McpAuthError)
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct JsonRpcRequest {
    jsonrpc: Option<String>,
    #[serde(default = "missing_request_id")]
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Deserialize)]
struct ToolCall {
    name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
struct WorkspaceInput {
    workspace_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct ReadPageInput {
    workspace_id: Uuid,
    page_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct SearchInput {
    workspace_id: Uuid,
    query: String,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ImageInput {
    workspace_id: Uuid,
    block_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct ApplyOperationsInput {
    workspace_id: Uuid,
    operations: Vec<Operation>,
}

pub(crate) async fn handle(
    State(state): State<AppState>,
    McpPrincipal(principal): McpPrincipal,
    headers: HeaderMap,
    Json(request): Json<JsonRpcRequest>,
) -> Response {
    // Native MCP clients do not send Origin. Refuse browser-originated requests to avoid DNS rebinding.
    if headers.contains_key(ORIGIN) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if request.jsonrpc.as_deref() != Some("2.0") {
        return rpc_error(Value::Null, -32600, "Invalid JSON-RPC request");
    }
    if request.id == missing_request_id() {
        return StatusCode::ACCEPTED.into_response();
    }
    let id = request.id;
    if !(id.is_string() || id.is_number()) {
        return rpc_error(Value::Null, -32600, "Invalid JSON-RPC request ID");
    }
    let result = match request.method.as_str() {
        "initialize" => {
            if request
                .params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .is_none()
                || !request
                    .params
                    .get("capabilities")
                    .is_some_and(Value::is_object)
                || !request
                    .params
                    .get("clientInfo")
                    .is_some_and(Value::is_object)
            {
                return rpc_error(id, -32602, "Invalid initialize parameters");
            }
            Ok(initialize_result())
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": tools()})),
        "tools/call" => match serde_json::from_value::<ToolCall>(request.params) {
            Ok(call) => call_tool(&state, &principal, call).await,
            Err(_) => Err(tool_error("Invalid tools/call parameters")),
        },
        _ => {
            return rpc_error(id, -32601, "Method not found");
        }
    };
    Json(match result {
        Ok(result) => json!({"jsonrpc": "2.0", "id": id, "result": result}),
        Err(result) => json!({"jsonrpc": "2.0", "id": id, "result": result}),
    })
    .into_response()
}

async fn call_tool(
    state: &AppState,
    principal: &IntegrationPrincipal,
    call: ToolCall,
) -> Result<Value, Value> {
    match call.name.as_str() {
        "reason_list_workspaces" => {
            let workspaces = state
                .list_workspaces
                .execute(principal.user_id)
                .await
                .map_err(app_tool_error)?
                .into_iter()
                .filter(|workspace| principal.workspace_ids.contains(&workspace.id))
                .collect::<Vec<_>>();
            text_result(&workspaces)
        }
        "reason_list_pages" => {
            let input = parse_arguments::<WorkspaceInput>(call.arguments)?;
            authorize(principal, IntegrationScope::ContentRead, input.workspace_id)?;
            let pages = state
                .list_pages
                .execute(principal.user_id, input.workspace_id)
                .await
                .map_err(app_tool_error)?;
            text_result(&pages)
        }
        "reason_read_page" => {
            let input = parse_arguments::<ReadPageInput>(call.arguments)?;
            authorize(principal, IntegrationScope::ContentRead, input.workspace_id)?;
            let page = state
                .get_page
                .execute(principal.user_id, input.workspace_id, input.page_id)
                .await
                .map_err(app_tool_error)?;
            text_result(&page)
        }
        "reason_search" => {
            let input = parse_arguments::<SearchInput>(call.arguments)?;
            authorize(principal, IntegrationScope::SearchRead, input.workspace_id)?;
            ensure_current_membership(state, principal.user_id, input.workspace_id).await?;
            let results = state
                .semantic_search
                .execute(
                    principal.user_id,
                    input.workspace_id,
                    input.query,
                    input.limit,
                )
                .await
                .map_err(app_tool_error)?;
            text_result(&results)
        }
        "reason_get_image" => {
            let input = parse_arguments::<ImageInput>(call.arguments)?;
            authorize(principal, IntegrationScope::MediaRead, input.workspace_id)?;
            let image = state
                .get_image
                .execute(principal.user_id, input.workspace_id, input.block_id)
                .await
                .map_err(app_tool_error)?;
            let metadata = serde_json::to_string(&image.metadata)
                .map_err(|_| tool_error("Reason could not serialize the image metadata"))?;
            Ok(json!({
                "content": [
                    {"type": "text", "text": metadata},
                    {
                        "type": "image",
                        "data": STANDARD.encode(image.bytes),
                        "mimeType": image.metadata.content_type
                    }
                ],
                "structuredContent": image.metadata,
                "isError": false
            }))
        }
        "reason_apply_operations" => {
            let input = parse_arguments::<ApplyOperationsInput>(call.arguments)?;
            authorize(
                principal,
                IntegrationScope::ContentWrite,
                input.workspace_id,
            )?;
            if input.operations.is_empty() || input.operations.len() > MAX_OPERATIONS_PER_CALL {
                return Err(tool_error("Operations must contain between 1 and 50 items"));
            }
            let acks = state
                .apply_operation
                .execute_batch(
                    principal.user_id,
                    input.workspace_id,
                    input.operations,
                    None,
                )
                .await
                .map_err(app_tool_error)?;
            text_result(&acks)
        }
        _ => Err(tool_error("Unknown Reason tool")),
    }
}

async fn ensure_current_membership(
    state: &AppState,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<(), Value> {
    let allowed = state
        .list_workspaces
        .execute(user_id)
        .await
        .map_err(app_tool_error)?
        .iter()
        .any(|workspace| workspace.id == workspace_id);
    if allowed {
        Ok(())
    } else {
        Err(tool_error(
            "You do not have permission to perform this action",
        ))
    }
}

fn rpc_error(id: Value, code: i32, message: &str) -> Response {
    Json(json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": code, "message": message}
    }))
    .into_response()
}

fn missing_request_id() -> Value {
    json!({"__reason_missing_request_id": true})
}

fn authorize(
    principal: &IntegrationPrincipal,
    scope: IntegrationScope,
    workspace_id: Uuid,
) -> Result<(), Value> {
    if principal.permits(scope, workspace_id) {
        Ok(())
    } else {
        Err(tool_error(
            "The integration is not allowed to perform this action",
        ))
    }
}

fn parse_arguments<T: for<'de> Deserialize<'de>>(arguments: Value) -> Result<T, Value> {
    serde_json::from_value(arguments).map_err(|_| tool_error("Invalid tool arguments"))
}

fn text_result(value: &impl serde::Serialize) -> Result<Value, Value> {
    let value = serde_json::to_value(value)
        .map_err(|_| tool_error("Reason could not serialize the tool result"))?;
    Ok(json!({
        "content": [{"type": "text", "text": value.to_string()}],
        "structuredContent": {"result": value},
        "isError": false
    }))
}

fn app_tool_error(error: AppError) -> Value {
    let message = match error {
        AppError::Unauthorized | AppError::Forbidden => {
            "You do not have permission to perform this action"
        }
        AppError::Domain(crate::domain::error::DomainError::Validation(message)) => message,
        AppError::Domain(crate::domain::error::DomainError::PageNotFound) => {
            "The requested page or block was not found"
        }
        AppError::StorageNotConfigured => "Object storage is not configured",
        AppError::AiUnavailable => "Semantic search is currently unavailable",
        _ => "Reason could not complete the request",
    };
    tool_error(message)
}

fn tool_error(message: &str) -> Value {
    json!({
        "content": [{"type": "text", "text": message}],
        "isError": true
    })
}

fn tools() -> Vec<Value> {
    vec![
        tool(
            "reason_list_workspaces",
            "List the Reason workspaces granted to this integration.",
            json!({"type": "object", "properties": {}, "additionalProperties": false}),
        ),
        tool(
            "reason_list_pages",
            "List pages in a granted Reason workspace.",
            workspace_schema(),
        ),
        tool(
            "reason_read_page",
            "Read a Reason page as its ordered block tree.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "page_id": uuid_schema()
                },
                "required": ["workspace_id", "page_id"],
                "additionalProperties": false
            }),
        ),
        tool(
            "reason_search",
            "Run permission-scoped semantic search over a Reason workspace.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "query": {"type": "string", "minLength": 2, "maxLength": 2000},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50}
                },
                "required": ["workspace_id", "query"],
                "additionalProperties": false
            }),
        ),
        tool(
            "reason_get_image",
            "Return an authorized Reason image block as multimodal MCP content.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "block_id": uuid_schema()
                },
                "required": ["workspace_id", "block_id"],
                "additionalProperties": false
            }),
        ),
        tool(
            "reason_apply_operations",
            "Atomically apply typed Reason block operations using the canonical sync engine.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "operations": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 50,
                        "items": operation_schema()
                    }
                },
                "required": ["workspace_id", "operations"],
                "additionalProperties": false
            }),
        ),
    ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({"name": name, "description": description, "inputSchema": input_schema})
}

fn workspace_schema() -> Value {
    json!({
        "type": "object",
        "properties": {"workspace_id": uuid_schema()},
        "required": ["workspace_id"],
        "additionalProperties": false
    })
}

fn uuid_schema() -> Value {
    json!({"type": "string", "format": "uuid"})
}

fn initialize_result() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": false}},
        "serverInfo": {
            "name": "reason",
            "version": env!("CARGO_PKG_VERSION")
        },
        "instructions": "Read and mutate Reason blocks only within the workspaces granted to this integration."
    })
}

fn operation_schema() -> Value {
    json!({
        "oneOf": [
            {
                "type": "object",
                "properties": {
                    "type": {"const": "insert_block"},
                    "opId": uuid_schema(),
                    "block": block_schema(),
                    "parentId": uuid_schema(),
                    "index": {"type": "integer", "minimum": 0}
                },
                "required": ["type", "opId", "block", "parentId", "index"],
                "additionalProperties": false
            },
            {
                "type": "object",
                "properties": {
                    "type": {"const": "update_block"},
                    "opId": uuid_schema(),
                    "blockId": uuid_schema(),
                    "blockType": block_type_schema(),
                    "properties": {"type": "object"},
                    "propVersions": {
                        "type": "object",
                        "additionalProperties": {"type": "integer", "minimum": 0}
                    }
                },
                "required": ["type", "opId", "blockId"],
                "additionalProperties": false
            },
            operation_with_block("move_block", json!({
                "newParentId": uuid_schema(),
                "index": {"type": "integer", "minimum": 0}
            }), &["newParentId", "index"]),
            operation_with_block("delete_block", json!({}), &[]),
            operation_with_block("restore_block", json!({}), &[])
        ]
    })
}

fn operation_with_block(
    operation_type: &str,
    extra_properties: Value,
    extra_required: &[&str],
) -> Value {
    let mut properties = serde_json::Map::from_iter([
        ("type".to_string(), json!({"const": operation_type})),
        ("opId".to_string(), uuid_schema()),
        ("blockId".to_string(), uuid_schema()),
    ]);
    if let Some(extra) = extra_properties.as_object() {
        properties.extend(extra.clone());
    }
    let mut required = vec![json!("type"), json!("opId"), json!("blockId")];
    required.extend(extra_required.iter().map(|name| json!(name)));
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

fn block_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": uuid_schema(),
            "workspaceId": uuid_schema(),
            "type": block_type_schema(),
            "properties": {"type": "object"},
            "propVersions": {
                "type": "object",
                "additionalProperties": {"type": "integer", "minimum": 0}
            },
            "content": {"type": "array", "maxItems": 0},
            "parentId": {"anyOf": [uuid_schema(), {"type": "null"}]},
            "trashedAt": {"type": ["string", "null"]},
            "trashedIndex": {"type": ["integer", "null"]}
        },
        "required": [
            "id", "workspaceId", "type", "properties", "content", "parentId",
            "trashedAt", "trashedIndex"
        ],
        "additionalProperties": false
    })
}

fn block_type_schema() -> Value {
    json!({
        "type": "string",
        "enum": [
            "page", "paragraph", "heading1", "heading2", "heading3",
            "bulleted_list_item", "numbered_list_item", "to_do", "toggle",
            "quote", "code", "callout", "divider", "image", "mermaid"
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn principal_requires_both_scope_and_workspace_grant() {
        let workspace = Uuid::new_v4();
        let principal = IntegrationPrincipal {
            token_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            scopes: vec![IntegrationScope::ContentRead],
            workspace_ids: vec![workspace],
        };
        assert!(authorize(&principal, IntegrationScope::ContentRead, workspace).is_ok());
        assert!(authorize(&principal, IntegrationScope::ContentWrite, workspace).is_err());
        assert!(authorize(&principal, IntegrationScope::ContentRead, Uuid::new_v4()).is_err());
    }

    #[test]
    fn tool_catalog_exposes_only_the_canonical_write_path() {
        let names = tools()
            .into_iter()
            .map(|tool| tool["name"].as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        assert!(names.contains(&"reason_apply_operations".to_string()));
        assert!(!names.iter().any(|name| name.contains("create_note")));
        assert!(!names.iter().any(|name| name.contains("edit_note")));
    }

    #[test]
    fn initialize_advertises_stateless_tool_capability() {
        let result = initialize_result();
        assert_eq!(result["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(result["serverInfo"]["name"], "reason");
        assert_eq!(result["capabilities"]["tools"]["listChanged"], false);
    }

    #[test]
    fn operation_tool_schema_excludes_internal_transfers() {
        let schema = operation_schema().to_string();
        assert!(schema.contains("insert_block"));
        assert!(schema.contains("update_block"));
        assert!(!schema.contains("transfer_subtree"));
    }

    #[test]
    fn operation_tool_schema_accepts_mermaid_blocks() {
        let types = block_type_schema()["enum"].as_array().unwrap().clone();

        assert!(types.contains(&json!("mermaid")));
    }

    #[test]
    fn text_result_wraps_structured_content_in_an_object() {
        let result = text_result(&vec!["one", "two"]).unwrap();

        assert_eq!(result["content"][0]["text"], r#"["one","two"]"#);
        assert_eq!(result["structuredContent"]["result"], json!(["one", "two"]));
        assert!(result["structuredContent"].is_object());
    }
}
