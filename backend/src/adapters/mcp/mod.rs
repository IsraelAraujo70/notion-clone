use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::header::{AUTHORIZATION, ORIGIN, WWW_AUTHENTICATE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::github::LinkGitHubPullRequestInput;
use crate::application::ports::integration::{IntegrationPrincipal, IntegrationScope};
use crate::application::ports::page::DirectChildrenQuery;
use crate::bootstrap::state::AppState;
use crate::domain::block::{Block, BlockType, Operation};

const PROTOCOL_VERSION: &str = "2025-06-18";
const MAX_OPERATIONS_PER_CALL: usize = 50;
const MAX_COMPACT_SUMMARY_CHARS: usize = 200;
const REASON_MCP_UUID_NAMESPACE: Uuid = Uuid::from_u128(0x1bce2d60_3f8b_5f43_9187_1e5e6c7b8301);

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
    #[serde(default = "empty_object")]
    arguments: Value,
}

fn empty_object() -> Value {
    Value::Object(Map::new())
}

#[derive(Debug, Deserialize)]
struct WorkspaceInput {
    workspace_id: Uuid,
    #[serde(default)]
    response_mode: ResponseMode,
}

#[derive(Debug, Deserialize)]
struct ReadPageInput {
    workspace_id: Uuid,
    page_id: Uuid,
    #[serde(default)]
    response_mode: ResponseMode,
    #[serde(default)]
    fields: Option<Vec<String>>,
    #[serde(default)]
    property_keys: Option<Vec<String>>,
    #[serde(default)]
    max_depth: Option<usize>,
    #[serde(default)]
    max_chars: Option<usize>,
    #[serde(default)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchInput {
    workspace_id: Uuid,
    query: String,
    limit: Option<i64>,
    #[serde(default)]
    response_mode: ResponseMode,
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
    #[serde(default)]
    response_mode: ResponseMode,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ResponseMode {
    #[default]
    Legacy,
    Compact,
}

#[derive(Debug, Deserialize)]
struct QueryBlocksInput {
    workspace_id: Uuid,
    parent_id: Uuid,
    #[serde(default)]
    block_type: Option<BlockType>,
    #[serde(default)]
    property_equals: Map<String, Value>,
    #[serde(default)]
    fields: Option<Vec<String>>,
    #[serde(default)]
    property_keys: Option<Vec<String>>,
    #[serde(default)]
    include_trashed: bool,
    #[serde(default = "default_query_limit")]
    limit: usize,
    #[serde(default)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompactApplyInput {
    workspace_id: Uuid,
    request_id: Uuid,
    operations: Value,
    #[serde(default)]
    return_blocks: bool,
    #[serde(default)]
    return_fields: Option<Vec<String>>,
    #[serde(default)]
    return_property_keys: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct CursorPayload {
    workspace_id: Uuid,
    subject_id: Uuid,
    workspace_seq: i64,
    position: usize,
    fingerprint: String,
}

#[derive(Serialize, Deserialize)]
struct SignedCursor {
    payload: CursorPayload,
    signature: String,
}

#[derive(Debug)]
pub(crate) struct CompiledCompactOperations {
    operations: Vec<Operation>,
    created: std::collections::BTreeMap<String, Uuid>,
}

#[derive(Debug, Deserialize)]
struct LinkPullRequestInput {
    workspace_id: Uuid,
    block_id: Uuid,
    pull_request_url: String,
    #[serde(default)]
    response_mode: ResponseMode,
}

#[derive(Debug, Deserialize)]
struct ResponseModeInput {
    #[serde(default)]
    response_mode: ResponseMode,
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
        "tools/list" => Ok(json!({"tools": tools_for(&principal)})),
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
            let response_mode = parse_arguments::<ResponseModeInput>(call.arguments)?.response_mode;
            let workspaces = state
                .list_workspaces
                .execute(principal.user_id)
                .await
                .map_err(app_tool_error)?
                .into_iter()
                .filter(|workspace| principal.workspace_ids.contains(&workspace.id))
                .collect::<Vec<_>>();
            result_for(response_mode, "Returned workspaces.", &workspaces)
        }
        "reason_list_pages" => {
            let input = parse_arguments::<WorkspaceInput>(call.arguments)?;
            authorize(principal, IntegrationScope::ContentRead, input.workspace_id)?;
            let pages = state
                .list_pages
                .execute(principal.user_id, input.workspace_id)
                .await
                .map_err(app_tool_error)?;
            result_for(input.response_mode, "Returned page summaries.", &pages)
        }
        "reason_read_page" => {
            let input = parse_arguments::<ReadPageInput>(call.arguments)?;
            authorize(principal, IntegrationScope::ContentRead, input.workspace_id)?;
            if input.response_mode == ResponseMode::Legacy
                && (input.fields.is_some()
                    || input.property_keys.is_some()
                    || input.max_depth.is_some()
                    || input.max_chars.is_some()
                    || input.cursor.is_some())
            {
                return Err(structured_tool_error(
                    "invalid_arguments",
                    "Compact page arguments require response_mode=compact",
                    Some("response_mode"),
                    Some("compact"),
                ));
            }
            let page = state
                .get_page
                .execute(principal.user_id, input.workspace_id, input.page_id)
                .await
                .map_err(app_tool_error)?;
            if input.response_mode == ResponseMode::Legacy {
                text_result(&page)
            } else {
                compact_page_result(&input, page, state.mcp_cursor_signing_key.as_bytes())
            }
        }
        "reason_query_blocks" => {
            let input = parse_arguments::<QueryBlocksInput>(call.arguments)?;
            authorize(principal, IntegrationScope::ContentRead, input.workspace_id)?;
            query_blocks(state, principal, input).await
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
            result_for(input.response_mode, "Returned search results.", &results)
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
            result_for(input.response_mode, "Applied operation batch.", &acks)
        }
        "reason_apply_operations_compact" => {
            let input = parse_arguments::<CompactApplyInput>(call.arguments)?;
            authorize(
                principal,
                IntegrationScope::ContentWrite,
                input.workspace_id,
            )?;
            if !input.operations.is_array() {
                return Err(structured_tool_error(
                    "invalid_arguments",
                    "Invalid tool arguments",
                    Some("operations"),
                    Some("an array of compact operations"),
                ));
            }
            let return_fields = if input.return_blocks {
                Some(validate_projection(
                    input.return_fields.as_deref(),
                    input.return_property_keys.as_deref(),
                )?)
            } else {
                None
            };
            let compiled =
                compile_compact_operations(input.workspace_id, input.request_id, input.operations)?;
            if compiled.operations.is_empty() {
                return Err(structured_tool_error(
                    "limit_exceeded",
                    "Operations must contain between 1 and 50 items",
                    Some("operations"),
                    Some("1 through 50 items"),
                ));
            }
            if compiled.operations.len() > MAX_OPERATIONS_PER_CALL {
                return Err(structured_tool_error(
                    "limit_exceeded",
                    "Operations must contain between 1 and 50 items",
                    Some("operations"),
                    Some("1 through 50 items"),
                ));
            }
            let acks = state
                .apply_operation
                .execute_batch(
                    principal.user_id,
                    input.workspace_id,
                    compiled.operations.clone(),
                    None,
                )
                .await
                .map_err(app_tool_error)?;
            let blocks = if input.return_blocks {
                Some(
                    compact_affected_blocks(
                        state,
                        principal,
                        input.workspace_id,
                        &compiled.operations,
                        return_fields.as_deref().expect("validated return fields"),
                        input.return_property_keys.as_deref(),
                    )
                    .await,
                )
            } else {
                None
            };
            let mut result = json!({"acks": acks, "created": compiled.created});
            if let Some(blocks) = blocks {
                result["blocks"] = Value::Array(blocks);
            }
            compact_result("Applied compact operation batch.", result)
        }
        "reason_list_pull_requests" => {
            let input = parse_arguments::<WorkspaceInput>(call.arguments)?;
            authorize(principal, IntegrationScope::GitHubRead, input.workspace_id)?;
            let links = state
                .github
                .list_pull_request_links(principal.user_id, input.workspace_id)
                .await
                .map_err(app_tool_error)?;
            result_for(input.response_mode, "Returned pull request links.", &links)
        }
        "reason_link_pull_request" => {
            let input = parse_arguments::<LinkPullRequestInput>(call.arguments)?;
            authorize_github_link(principal, input.workspace_id)?;
            let link = state
                .github
                .link_pull_request(
                    principal.user_id,
                    input.workspace_id,
                    input.block_id,
                    LinkGitHubPullRequestInput {
                        url: input.pull_request_url,
                    },
                )
                .await
                .map_err(app_tool_error)?;
            result_for(input.response_mode, "Linked pull request.", &link)
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
        Err(structured_tool_error(
            "permission_denied",
            "You do not have permission to perform this action",
            None,
            None,
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
        Err(structured_tool_error(
            "permission_denied",
            "The integration is not allowed to perform this action",
            None,
            None,
        ))
    }
}

fn authorize_github_link(
    principal: &IntegrationPrincipal,
    workspace_id: Uuid,
) -> Result<(), Value> {
    authorize(principal, IntegrationScope::GitHubRead, workspace_id)?;
    authorize(principal, IntegrationScope::GitHubWrite, workspace_id)
}

fn parse_arguments<T: for<'de> Deserialize<'de>>(arguments: Value) -> Result<T, Value> {
    let bytes = serde_json::to_vec(&arguments).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid tool arguments",
            None,
            Some("valid JSON arguments"),
        )
    })?;
    let mut deserializer = serde_json::Deserializer::from_slice(&bytes);
    serde_path_to_error::deserialize(&mut deserializer).map_err(|error| {
        let path = error.path().to_string();
        structured_tool_error(
            "invalid_arguments",
            "Invalid tool arguments",
            (!path.is_empty()).then_some(path.as_str()),
            Some(&error.inner().to_string()),
        )
    })
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

pub(crate) fn compact_result(summary: &str, result: Value) -> Result<Value, Value> {
    let safe_summary = if summary.chars().count() > MAX_COMPACT_SUMMARY_CHARS {
        "Completed.".to_string()
    } else {
        summary.to_string()
    };
    Ok(json!({
        "content": [{"type": "text", "text": safe_summary}],
        "structuredContent": {"result": result},
        "isError": false
    }))
}

fn result_for(
    response_mode: ResponseMode,
    summary: &str,
    value: &impl serde::Serialize,
) -> Result<Value, Value> {
    match response_mode {
        ResponseMode::Legacy => text_result(value),
        ResponseMode::Compact => compact_result(
            summary,
            serde_json::to_value(value)
                .map_err(|_| tool_error("Reason could not serialize the tool result"))?,
        ),
    }
}

fn app_tool_error(error: AppError) -> Value {
    match error {
        AppError::Unauthorized | AppError::Forbidden => structured_tool_error(
            "permission_denied",
            "You do not have permission to perform this action",
            None,
            None,
        ),
        AppError::Domain(crate::domain::error::DomainError::Validation(message))
            if message.contains("replay conflicts") =>
        {
            structured_tool_error("operation_conflict", message, None, None)
        }
        AppError::Domain(crate::domain::error::DomainError::Validation(message)) => {
            structured_tool_error("invalid_arguments", message, None, None)
        }
        AppError::Domain(crate::domain::error::DomainError::PageNotFound) => structured_tool_error(
            "not_found",
            "The requested page or block was not found",
            None,
            None,
        ),
        AppError::StorageNotConfigured => structured_tool_error(
            "unavailable",
            "Object storage is not configured",
            None,
            None,
        ),
        AppError::AiUnavailable => structured_tool_error(
            "unavailable",
            "Semantic search is currently unavailable",
            None,
            None,
        ),
        _ => tool_error("Reason could not complete the request"),
    }
}

fn tool_error(message: &str) -> Value {
    structured_tool_error("internal_error", message, None, None)
}

pub(crate) fn structured_tool_error(
    code: &str,
    message: &str,
    path: Option<&str>,
    expected: Option<&str>,
) -> Value {
    let mut error = serde_json::Map::from_iter([
        ("code".to_string(), Value::String(code.to_string())),
        ("message".to_string(), Value::String(message.to_string())),
    ]);
    if let Some(path) = path {
        error.insert("path".to_string(), Value::String(path.to_string()));
    }
    if let Some(expected) = expected {
        error.insert("expected".to_string(), Value::String(expected.to_string()));
    }
    let mut response = serde_json::Map::from_iter([
        (
            "content".to_string(),
            json!([{"type": "text", "text": message}]),
        ),
        (
            "structuredContent".to_string(),
            json!({"error": Value::Object(error.clone())}),
        ),
        ("isError".to_string(), Value::Bool(true)),
    ]);
    response.extend(error);
    Value::Object(response)
}

fn default_query_limit() -> usize {
    50
}

pub(crate) fn encode_cursor(payload: &CursorPayload, key: &[u8]) -> Result<String, Value> {
    let payload_bytes = serde_json::to_vec(payload).map_err(|_| {
        structured_tool_error(
            "internal_error",
            "Reason could not encode cursor",
            None,
            None,
        )
    })?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| {
        structured_tool_error(
            "internal_error",
            "Reason could not encode cursor",
            None,
            None,
        )
    })?;
    mac.update(&payload_bytes);
    let signed = SignedCursor {
        payload: payload.clone(),
        signature: URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()),
    };
    let bytes = serde_json::to_vec(&signed).map_err(|_| {
        structured_tool_error(
            "internal_error",
            "Reason could not encode cursor",
            None,
            None,
        )
    })?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub(crate) fn decode_cursor(cursor: &str, key: &[u8]) -> Result<CursorPayload, Value> {
    let bytes = URL_SAFE_NO_PAD.decode(cursor).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    let signed: SignedCursor = serde_json::from_slice(&bytes).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    let payload_bytes = serde_json::to_vec(&signed.payload).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    mac.update(&payload_bytes);
    let signature = URL_SAFE_NO_PAD.decode(signed.signature).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    mac.verify_slice(&signature).map_err(|_| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid cursor",
            Some("cursor"),
            Some("a signed Reason cursor"),
        )
    })?;
    Ok(signed.payload)
}

pub(crate) fn validate_cursor(
    cursor: &CursorPayload,
    workspace_id: Uuid,
    subject_id: Uuid,
    workspace_seq: i64,
    fingerprint: &str,
) -> Result<(), Value> {
    if cursor.workspace_seq != workspace_seq {
        return Err(structured_tool_error(
            "stale_cursor",
            "Workspace changed; restart the query",
            Some("cursor"),
            Some("a cursor for the current workspace version"),
        ));
    }
    if cursor.workspace_id != workspace_id
        || cursor.subject_id != subject_id
        || cursor.fingerprint != fingerprint
    {
        return Err(structured_tool_error(
            "invalid_arguments",
            "Cursor does not match this request",
            Some("cursor"),
            Some("a cursor for the same workspace, target, and filters"),
        ));
    }
    Ok(())
}

fn projection_fingerprint(
    fields: Option<&[String]>,
    property_keys: Option<&[String]>,
    extra: &Value,
) -> String {
    let value = json!({"fields": fields, "property_keys": property_keys, "extra": extra});
    hex::encode(Sha256::digest(
        serde_json::to_vec(&value).unwrap_or_default(),
    ))
}

fn validate_projection(
    fields: Option<&[String]>,
    property_keys: Option<&[String]>,
) -> Result<Vec<String>, Value> {
    const ALLOWED: &[&str] = &[
        "id",
        "type",
        "parentId",
        "properties",
        "content",
        "propVersions",
        "trashedAt",
        "trashedIndex",
    ];
    if fields.is_some_and(|fields| fields.len() > ALLOWED.len()) {
        return Err(structured_tool_error(
            "limit_exceeded",
            "Too many projection fields",
            Some("fields"),
            Some("at most eight fields"),
        ));
    }
    if property_keys.is_some_and(|keys| keys.len() > 32) {
        return Err(structured_tool_error(
            "limit_exceeded",
            "Too many property keys",
            Some("property_keys"),
            Some("at most 32 keys"),
        ));
    }
    let fields = fields.map_or_else(
        || ALLOWED.iter().map(|field| (*field).to_string()).collect(),
        |fields| fields.to_vec(),
    );
    for field in &fields {
        if !ALLOWED.contains(&field.as_str()) {
            return Err(structured_tool_error(
                "invalid_arguments",
                "Invalid projection field",
                Some("fields"),
                Some("a supported block field"),
            ));
        }
    }
    if property_keys.is_some_and(|keys| keys.iter().any(|key| key.is_empty())) {
        return Err(structured_tool_error(
            "invalid_arguments",
            "Invalid property key",
            Some("property_keys"),
            Some("non-empty property keys"),
        ));
    }
    Ok(fields)
}

fn project_block(block: &Block, fields: &[String], property_keys: Option<&[String]>) -> Value {
    let mut projected = Map::new();
    for field in fields {
        match field.as_str() {
            "id" => {
                projected.insert("id".into(), json!(block.id));
            }
            "type" => {
                projected.insert("type".into(), json!(block.block_type.as_str()));
            }
            "parentId" => {
                projected.insert("parentId".into(), json!(block.parent_id));
            }
            "properties" => {
                let properties = property_keys.map_or_else(
                    || block.properties.clone(),
                    |keys| {
                        keys.iter()
                            .filter_map(|key| {
                                block
                                    .properties
                                    .get(key)
                                    .map(|value| (key.clone(), value.clone()))
                            })
                            .collect()
                    },
                );
                projected.insert("properties".into(), Value::Object(properties));
            }
            "content" => {
                projected.insert("content".into(), json!(block.content));
            }
            "propVersions" => {
                projected.insert("propVersions".into(), json!(block.prop_versions));
            }
            "trashedAt" => {
                projected.insert("trashedAt".into(), json!(block.trashed_at));
            }
            "trashedIndex" => {
                projected.insert("trashedIndex".into(), json!(block.trashed_index));
            }
            _ => {}
        }
    }
    Value::Object(projected)
}

async fn query_blocks(
    state: &AppState,
    principal: &IntegrationPrincipal,
    input: QueryBlocksInput,
) -> Result<Value, Value> {
    if input.limit == 0 || input.limit > 100 {
        return Err(structured_tool_error(
            "limit_exceeded",
            "limit must be between 1 and 100",
            Some("limit"),
            Some("1 through 100"),
        ));
    }
    if input.property_equals.len() > 8
        || input.property_equals.values().any(|value| {
            !value.is_string() && !value.is_number() && !value.is_boolean() && !value.is_null()
        })
    {
        return Err(structured_tool_error(
            "invalid_arguments",
            "Invalid property_equals filter",
            Some("property_equals"),
            Some("up to eight scalar property values"),
        ));
    }
    let fields = validate_projection(input.fields.as_deref(), input.property_keys.as_deref())?;
    let filters = json!({"block_type": input.block_type.map(BlockType::as_str), "property_equals": input.property_equals, "include_trashed": input.include_trashed});
    let fingerprint = projection_fingerprint(
        input.fields.as_deref(),
        input.property_keys.as_deref(),
        &filters,
    );
    let key = state.mcp_cursor_signing_key.as_bytes();
    let start_position = match input.cursor.as_deref() {
        Some(cursor) => decode_cursor(cursor, key)?.position,
        None => 0,
    };
    let page = state
        .query_blocks
        .execute(
            principal.user_id,
            input.workspace_id,
            DirectChildrenQuery {
                parent_id: input.parent_id,
                block_type: input.block_type,
                property_equals: input.property_equals,
                include_trashed: input.include_trashed,
                limit: input.limit,
                start_position,
            },
        )
        .await
        .map_err(app_tool_error)?;
    if let Some(cursor) = input.cursor.as_deref() {
        let decoded = decode_cursor(cursor, key)?;
        validate_cursor(
            &decoded,
            input.workspace_id,
            input.parent_id,
            page.workspace_seq,
            &fingerprint,
        )?;
    }
    let next_cursor = page
        .next_position
        .map(|position| {
            encode_cursor(
                &CursorPayload {
                    workspace_id: input.workspace_id,
                    subject_id: input.parent_id,
                    workspace_seq: page.workspace_seq,
                    position,
                    fingerprint,
                },
                key,
            )
        })
        .transpose()?;
    compact_result(
        &format!("Returned {} blocks.", page.items.len()),
        json!({"items": page.items.iter().map(|block| project_block(block, &fields, input.property_keys.as_deref())).collect::<Vec<_>>(), "next_cursor": next_cursor, "workspace_seq": page.workspace_seq}),
    )
}

fn compact_page_result(
    input: &ReadPageInput,
    page: crate::application::ports::page::PageView,
    key: &[u8],
) -> Result<Value, Value> {
    let max_depth = input.max_depth.unwrap_or(8);
    let max_chars = input.max_chars.unwrap_or(20_000);
    if max_depth > 32 {
        return Err(structured_tool_error(
            "limit_exceeded",
            "max_depth must be between 0 and 32",
            Some("max_depth"),
            Some("0 through 32"),
        ));
    }
    if !(1_000..=100_000).contains(&max_chars) {
        return Err(structured_tool_error(
            "limit_exceeded",
            "max_chars must be between 1000 and 100000",
            Some("max_chars"),
            Some("1000 through 100000"),
        ));
    }
    let fields = validate_projection(input.fields.as_deref(), input.property_keys.as_deref())?;
    let fingerprint = projection_fingerprint(
        input.fields.as_deref(),
        input.property_keys.as_deref(),
        &json!({"max_depth": max_depth, "max_chars": max_chars}),
    );
    let ordered = preorder_blocks(&page.page.blocks, page.page.root_id, max_depth);
    let start_position = match input.cursor.as_deref() {
        Some(cursor) => {
            let cursor = decode_cursor(cursor, key)?;
            validate_cursor(
                &cursor,
                input.workspace_id,
                input.page_id,
                page.seq,
                &fingerprint,
            )?;
            cursor.position
        }
        None => 0,
    };
    let mut blocks = Vec::new();
    let mut chars = 0usize;
    let mut index = start_position;
    while let Some(block) = ordered.get(index) {
        let projected = project_block(block, &fields, input.property_keys.as_deref());
        let serialized_chars = serde_json::to_string(&projected)
            .map_err(|_| tool_error("Reason could not serialize the page"))?
            .chars()
            .count();
        if serialized_chars > max_chars {
            return Err(structured_tool_error(
                "limit_exceeded",
                "A projected block exceeds max_chars",
                Some("max_chars"),
                Some("a larger maximum or smaller projection"),
            ));
        }
        if !blocks.is_empty() && chars + serialized_chars > max_chars {
            break;
        }
        chars += serialized_chars;
        blocks.push(projected);
        index += 1;
    }
    let truncated = index < ordered.len();
    let next_cursor = if truncated {
        Some(encode_cursor(
            &CursorPayload {
                workspace_id: input.workspace_id,
                subject_id: input.page_id,
                workspace_seq: page.seq,
                position: index,
                fingerprint,
            },
            key,
        )?)
    } else {
        None
    };
    compact_result(
        &format!("Returned {} blocks.", blocks.len()),
        json!({
            "page": {"rootId": page.page.root_id},
            "blocks": blocks,
            "next_cursor": next_cursor,
            "workspace_seq": page.seq,
            "truncated": truncated
        }),
    )
}

fn preorder_blocks(blocks: &[Block], root_id: Uuid, max_depth: usize) -> Vec<&Block> {
    let indexed = blocks
        .iter()
        .map(|block| (block.id, block))
        .collect::<std::collections::HashMap<_, _>>();
    fn visit<'a>(
        id: Uuid,
        depth: usize,
        max_depth: usize,
        indexed: &std::collections::HashMap<Uuid, &'a Block>,
        visited: &mut std::collections::HashSet<Uuid>,
        output: &mut Vec<&'a Block>,
    ) {
        if !visited.insert(id) {
            return;
        }
        let Some(block) = indexed.get(&id).copied() else {
            return;
        };
        output.push(block);
        if depth < max_depth {
            for child_id in &block.content {
                visit(*child_id, depth + 1, max_depth, indexed, visited, output);
            }
        }
    }
    let mut output = Vec::new();
    let mut visited = std::collections::HashSet::new();
    visit(root_id, 0, max_depth, &indexed, &mut visited, &mut output);
    output
}

pub(crate) fn compile_compact_operations(
    workspace_id: Uuid,
    request_id: Uuid,
    drafts: Value,
) -> Result<CompiledCompactOperations, Value> {
    let drafts = drafts.as_array().ok_or_else(|| {
        structured_tool_error(
            "invalid_arguments",
            "Invalid tool arguments",
            Some("operations"),
            Some("an array"),
        )
    })?;
    if drafts.len() > MAX_OPERATIONS_PER_CALL {
        return Err(structured_tool_error(
            "limit_exceeded",
            "Operations must contain between 1 and 50 items",
            Some("operations"),
            Some("1 through 50 items"),
        ));
    }
    let mut created = std::collections::BTreeMap::new();
    let mut operations = Vec::with_capacity(drafts.len());
    for (index, draft) in drafts.iter().enumerate() {
        let object = draft
            .as_object()
            .ok_or_else(|| compact_error(index, "type", "an operation object"))?;
        let operation_type = required_string(object, "type", index)?;
        validate_compact_operation_fields(object, operation_type, index)?;
        let op_id = Uuid::new_v5(
            &REASON_MCP_UUID_NAMESPACE,
            format!("reason-mcp/op/{workspace_id}/{request_id}/{index}").as_bytes(),
        );
        let operation = match operation_type {
            "insert_block" => {
                let client_ref = required_string(object, "client_ref", index)?;
                if !valid_client_ref(client_ref) {
                    return Err(compact_error(
                        index,
                        "client_ref",
                        "a unique reference matching ^[A-Za-z][A-Za-z0-9_-]{0,63}$",
                    ));
                }
                if created.contains_key(client_ref) {
                    return Err(compact_error(index, "client_ref", "a unique client_ref"));
                }
                let parent_id = resolve_target(object, index, "parent_id", "parent_ref", &created)?;
                let block_type = object
                    .get("block_type")
                    .and_then(Value::as_str)
                    .ok_or_else(|| compact_error(index, "block_type", "a supported block type"))
                    .and_then(|kind| {
                        crate::domain::block::parse_block_type(kind).map_err(|_| {
                            compact_error(index, "block_type", "a supported block type")
                        })
                    })?;
                let properties = object
                    .get("properties")
                    .and_then(Value::as_object)
                    .cloned()
                    .ok_or_else(|| compact_error(index, "properties", "an object"))?;
                let prop_versions = object
                    .get("prop_versions")
                    .map(|value| parse_prop_versions(value, index))
                    .transpose()?;
                let block_id = Uuid::new_v5(
                    &REASON_MCP_UUID_NAMESPACE,
                    format!("reason-mcp/block/{workspace_id}/{request_id}/{client_ref}").as_bytes(),
                );
                created.insert(client_ref.to_string(), block_id);
                Operation::InsertBlock {
                    op_id,
                    block: Block {
                        id: block_id,
                        workspace_id,
                        block_type,
                        properties,
                        prop_versions: prop_versions.unwrap_or_default(),
                        content: Vec::new(),
                        parent_id: Some(parent_id),
                        trashed_at: None,
                        trashed_index: None,
                    },
                    parent_id,
                    index: required_index(object, index)?,
                }
            }
            "update_block" => Operation::UpdateBlock {
                op_id,
                block_id: resolve_target(object, index, "block_id", "block_ref", &created)?,
                block_type: object
                    .get("block_type")
                    .map(|value| {
                        value
                            .as_str()
                            .ok_or_else(|| {
                                compact_error(index, "block_type", "a supported block type")
                            })
                            .and_then(|kind| {
                                crate::domain::block::parse_block_type(kind).map_err(|_| {
                                    compact_error(index, "block_type", "a supported block type")
                                })
                            })
                    })
                    .transpose()?,
                properties: object
                    .get("properties")
                    .map(|value| {
                        value
                            .as_object()
                            .cloned()
                            .ok_or_else(|| compact_error(index, "properties", "an object"))
                    })
                    .transpose()?,
                prop_versions: Some(object.get("prop_versions").ok_or_else(|| {
                    compact_error(
                        index,
                        "prop_versions",
                        "explicit property versions for update_block",
                    )
                })?)
                .map(|value| parse_prop_versions(value, index))
                .transpose()?,
            },
            "move_block" => Operation::MoveBlock {
                op_id,
                block_id: resolve_target(object, index, "block_id", "block_ref", &created)?,
                new_parent_id: resolve_target(
                    object,
                    index,
                    "new_parent_id",
                    "new_parent_ref",
                    &created,
                )?,
                index: required_index(object, index)?,
            },
            "delete_block" => Operation::DeleteBlock {
                op_id,
                block_id: resolve_target(object, index, "block_id", "block_ref", &created)?,
            },
            "restore_block" => Operation::RestoreBlock {
                op_id,
                block_id: resolve_target(object, index, "block_id", "block_ref", &created)?,
            },
            _ => {
                return Err(compact_error(
                    index,
                    "type",
                    "insert_block, update_block, move_block, delete_block, or restore_block",
                ));
            }
        };
        operations.push(operation);
    }
    Ok(CompiledCompactOperations {
        operations,
        created,
    })
}

fn compact_error(index: usize, field: &str, expected: &str) -> Value {
    structured_tool_error(
        "invalid_arguments",
        "Invalid tool arguments",
        Some(&format!("operations[{index}].{field}")),
        Some(expected),
    )
}

fn validate_compact_operation_fields(
    object: &Map<String, Value>,
    operation_type: &str,
    index: usize,
) -> Result<(), Value> {
    let allowed: &[&str] = match operation_type {
        "insert_block" => &[
            "type",
            "client_ref",
            "parent_id",
            "parent_ref",
            "index",
            "block_type",
            "properties",
            "prop_versions",
        ],
        "update_block" => &[
            "type",
            "block_id",
            "block_ref",
            "block_type",
            "properties",
            "prop_versions",
        ],
        "move_block" => &[
            "type",
            "block_id",
            "block_ref",
            "new_parent_id",
            "new_parent_ref",
            "index",
        ],
        "delete_block" | "restore_block" => &["type", "block_id", "block_ref"],
        _ => return Ok(()),
    };
    if let Some(field) = object
        .keys()
        .find(|field| !allowed.contains(&field.as_str()))
    {
        return Err(compact_error(
            index,
            field,
            "a supported compact operation field",
        ));
    }
    Ok(())
}

fn required_string<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<&'a str, Value> {
    object
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| compact_error(index, field, "a string"))
}

fn required_index(object: &Map<String, Value>, index: usize) -> Result<i64, Value> {
    object
        .get("index")
        .and_then(Value::as_i64)
        .filter(|value| *value >= 0)
        .ok_or_else(|| compact_error(index, "index", "a non-negative integer"))
}

fn resolve_target(
    object: &Map<String, Value>,
    index: usize,
    id_field: &str,
    ref_field: &str,
    created: &std::collections::BTreeMap<String, Uuid>,
) -> Result<Uuid, Value> {
    let id = object.get(id_field);
    let reference = object.get(ref_field);
    match (id, reference) {
        (Some(Value::String(id)), None) => {
            Uuid::parse_str(id).map_err(|_| compact_error(index, id_field, "a UUID"))
        }
        (None, Some(Value::String(reference))) => created
            .get(reference)
            .copied()
            .ok_or_else(|| compact_error(index, ref_field, "a previously declared client_ref")),
        _ => Err(compact_error(
            index,
            id_field,
            &format!("exactly one of {id_field} or {ref_field}"),
        )),
    }
}

fn valid_client_ref(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(character) if character.is_ascii_alphabetic())
        && value.len() <= 64
        && chars.all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

fn parse_prop_versions(
    value: &Value,
    operation_index: usize,
) -> Result<std::collections::HashMap<String, i64>, Value> {
    value
        .as_object()
        .ok_or_else(|| {
            compact_error(
                operation_index,
                "prop_versions",
                "an object of integer versions",
            )
        })?
        .iter()
        .map(|(key, value)| {
            value
                .as_i64()
                .filter(|version| *version >= 0)
                .map(|version| (key.clone(), version))
                .ok_or_else(|| {
                    compact_error(
                        operation_index,
                        "prop_versions",
                        "non-negative integer versions",
                    )
                })
        })
        .collect()
}

async fn compact_affected_blocks(
    state: &AppState,
    principal: &IntegrationPrincipal,
    workspace_id: Uuid,
    operations: &[Operation],
    return_fields: &[String],
    return_property_keys: Option<&[String]>,
) -> Vec<Value> {
    let ids = snapshot_candidate_ids(operations);
    let mut projected = Vec::new();
    for id in ids.into_iter().take(MAX_OPERATIONS_PER_CALL) {
        let Ok(page) = state
            .get_page
            .execute_for_block(principal.user_id, workspace_id, id)
            .await
        else {
            // Snapshots são evidência opcional. Os ACKs continuam sendo a
            // confirmação autoritativa quando a leitura pós-commit falha.
            continue;
        };
        if let Some(block) = page.page.blocks.iter().find(|block| block.id == id) {
            projected.push(project_block(block, return_fields, return_property_keys));
        }
    }
    projected
}

fn snapshot_candidate_ids(operations: &[Operation]) -> Vec<Uuid> {
    let mut ids = Vec::new();
    for operation in operations {
        let id = match operation {
            Operation::InsertBlock { block, .. } => block.id,
            Operation::UpdateBlock { block_id, .. }
            | Operation::MoveBlock { block_id, .. }
            | Operation::RestoreBlock { block_id, .. } => *block_id,
            // A exclusão já foi confirmada pelo ACK canônico. Não tente ler o
            // bloco apagado depois do commit, pois uma falha de snapshot não
            // pode transformar uma escrita concluída em resposta de erro.
            Operation::DeleteBlock { .. } => continue,
            Operation::TransferSubtreeOut { .. } | Operation::TransferSubtreeIn { .. } => continue,
        };
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    ids
}

fn tools() -> Vec<Value> {
    vec![
        tool(
            "reason_list_workspaces",
            "List the Reason workspaces granted to this integration.",
            json!({"type": "object", "properties": {"response_mode": response_mode_schema()}, "additionalProperties": false}),
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
                    "page_id": uuid_schema(),
                    "response_mode": response_mode_schema(),
                    "fields": projection_fields_schema(),
                    "property_keys": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 32},
                    "max_depth": {"type": "integer", "minimum": 0, "maximum": 32},
                    "max_chars": {"type": "integer", "minimum": 1000, "maximum": 100000},
                    "cursor": {"type": ["string", "null"]}
                },
                "required": ["workspace_id", "page_id"],
                "additionalProperties": false
            }),
        ),
        tool(
            "reason_query_blocks",
            "List direct child blocks in parent content order with exact scalar property filters.",
            query_blocks_schema(),
        ),
        tool(
            "reason_search",
            "Run permission-scoped semantic search over a Reason workspace.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "query": {"type": "string", "minLength": 2, "maxLength": 2000},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50},
                    "response_mode": response_mode_schema()
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
                    },
                    "response_mode": response_mode_schema()
                },
                "required": ["workspace_id", "operations"],
                "additionalProperties": false
            }),
        ),
        tool(
            "reason_apply_operations_compact",
            "Compile compact block drafts into canonical Reason operations and apply them atomically.",
            compact_operation_schema(),
        ),
        tool(
            "reason_list_pull_requests",
            "List pull requests linked to blocks in an authorized Reason workspace.",
            workspace_schema(),
        ),
        tool(
            "reason_link_pull_request",
            "Link a canonical GitHub pull request URL to a Reason page or database row.",
            json!({
                "type": "object",
                "properties": {
                    "workspace_id": uuid_schema(),
                    "block_id": uuid_schema(),
                    "response_mode": response_mode_schema(),
                    "pull_request_url": {
                        "type": "string",
                        "pattern": "^https://github\\.com/[^/]+/[^/]+/pull/[1-9][0-9]*$"
                    }
                },
                "required": ["workspace_id", "block_id", "pull_request_url"],
                "additionalProperties": false
            }),
        ),
    ]
}

pub(crate) fn tools_for(principal: &IntegrationPrincipal) -> Vec<Value> {
    tools()
        .into_iter()
        .filter(|tool| match tool["name"].as_str() {
            Some("reason_list_workspaces") => true,
            Some("reason_list_pages") | Some("reason_read_page") | Some("reason_query_blocks") => {
                principal.scopes.contains(&IntegrationScope::ContentRead)
            }
            Some("reason_apply_operations") | Some("reason_apply_operations_compact") => {
                principal.scopes.contains(&IntegrationScope::ContentWrite)
            }
            Some("reason_search") => principal.scopes.contains(&IntegrationScope::SearchRead),
            Some("reason_get_image") => principal.scopes.contains(&IntegrationScope::MediaRead),
            Some("reason_list_pull_requests") => {
                principal.scopes.contains(&IntegrationScope::GitHubRead)
            }
            Some("reason_link_pull_request") => {
                principal.scopes.contains(&IntegrationScope::GitHubRead)
                    && principal.scopes.contains(&IntegrationScope::GitHubWrite)
            }
            _ => false,
        })
        .collect()
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({"name": name, "description": description, "inputSchema": input_schema})
}

fn workspace_schema() -> Value {
    json!({
        "type": "object",
        "properties": {"workspace_id": uuid_schema(), "response_mode": response_mode_schema()},
        "required": ["workspace_id"],
        "additionalProperties": false
    })
}

fn response_mode_schema() -> Value {
    json!({"type": "string", "enum": ["legacy", "compact"]})
}

fn projection_fields_schema() -> Value {
    json!({"type": "array", "items": {"type": "string", "enum": ["id", "type", "parentId", "properties", "content", "propVersions", "trashedAt", "trashedIndex"]}, "maxItems": 8})
}

fn query_blocks_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "workspace_id": uuid_schema(),
            "parent_id": uuid_schema(),
            "block_type": block_type_schema(),
            "property_equals": {"type": "object", "maxProperties": 8, "additionalProperties": {"type": ["string", "number", "boolean", "null"]}},
            "fields": projection_fields_schema(),
            "property_keys": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 32},
            "include_trashed": {"type": "boolean"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            "cursor": {"type": ["string", "null"]}
        },
        "required": ["workspace_id", "parent_id"],
        "additionalProperties": false
    })
}

fn compact_operation_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "workspace_id": uuid_schema(),
            "request_id": uuid_schema(),
            "operations": {"type": "array", "minItems": 1, "maxItems": 50, "items": {"oneOf": [
                {"type": "object", "properties": {"type": {"const": "insert_block"}, "client_ref": {"type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_-]{0,63}$"}, "parent_id": uuid_schema(), "parent_ref": {"type": "string"}, "index": {"type": "integer", "minimum": 0}, "block_type": block_type_schema(), "properties": {"type": "object"}, "prop_versions": {"type": "object", "additionalProperties": {"type": "integer", "minimum": 0}}}, "required": ["type", "client_ref", "index", "block_type", "properties"], "additionalProperties": false},
                {"type": "object", "properties": {"type": {"const": "update_block"}, "block_id": uuid_schema(), "block_ref": {"type": "string"}, "block_type": block_type_schema(), "properties": {"type": "object"}, "prop_versions": {"type": "object", "additionalProperties": {"type": "integer", "minimum": 0}}}, "required": ["type", "prop_versions"], "additionalProperties": false},
                {"type": "object", "properties": {"type": {"const": "move_block"}, "block_id": uuid_schema(), "block_ref": {"type": "string"}, "new_parent_id": uuid_schema(), "new_parent_ref": {"type": "string"}, "index": {"type": "integer", "minimum": 0}}, "required": ["type", "index"], "additionalProperties": false},
                {"type": "object", "properties": {"type": {"const": "delete_block"}, "block_id": uuid_schema(), "block_ref": {"type": "string"}}, "required": ["type"], "additionalProperties": false},
                {"type": "object", "properties": {"type": {"const": "restore_block"}, "block_id": uuid_schema(), "block_ref": {"type": "string"}}, "required": ["type"], "additionalProperties": false}
            ]}},
            "return_blocks": {"type": "boolean"},
            "return_fields": projection_fields_schema(),
            "return_property_keys": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 32}
        },
        "required": ["workspace_id", "request_id", "operations"],
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
            "quote", "code", "callout", "divider", "image", "mermaid",
            "database", "database_row"
        ]
    })
}

#[cfg(test)]
mod token_efficient_tests;

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
    fn linking_a_pull_request_requires_both_github_scopes() {
        let workspace = Uuid::new_v4();
        let mut principal = IntegrationPrincipal {
            token_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            scopes: vec![IntegrationScope::GitHubWrite],
            workspace_ids: vec![workspace],
        };
        assert!(authorize_github_link(&principal, workspace).is_err());
        principal.scopes.push(IntegrationScope::GitHubRead);
        assert!(authorize_github_link(&principal, workspace).is_ok());
    }

    #[test]
    fn tool_catalog_exposes_only_the_canonical_write_path() {
        let names = tools()
            .into_iter()
            .map(|tool| tool["name"].as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        assert!(names.contains(&"reason_apply_operations".to_string()));
        assert!(names.contains(&"reason_list_pull_requests".to_string()));
        assert!(names.contains(&"reason_link_pull_request".to_string()));
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
    fn operation_tool_schema_accepts_structured_blocks() {
        let types = block_type_schema()["enum"].as_array().unwrap().clone();

        assert!(types.contains(&json!("mermaid")));
        assert!(types.contains(&json!("database")));
        assert!(types.contains(&json!("database_row")));
    }

    #[test]
    fn text_result_wraps_structured_content_in_an_object() {
        let result = text_result(&vec!["one", "two"]).unwrap();

        assert_eq!(result["content"][0]["text"], r#"["one","two"]"#);
        assert_eq!(result["structuredContent"]["result"], json!(["one", "two"]));
        assert!(result["structuredContent"].is_object());
    }
}
