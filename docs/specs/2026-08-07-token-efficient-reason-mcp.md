# Token-efficient Reason MCP

## Status

Implemented and validated locally on `codex/mcp-token-efficient-v2` on 2026-08-07. Production configuration and deployment remain separately gated.

## Problem statement

The Reason MCP exposes the correct authorization and canonical operation boundaries, but its client contract wastes model context and makes deterministic content workflows unnecessarily expensive.

The current server:

- duplicates serialized values in both `content[0].text` and `structuredContent.result`;
- returns complete page trees when a client needs only a few fields;
- cannot query direct database children by exact title or status;
- forces semantic search into deterministic discovery and duplicate checks;
- requires verbose block metadata, IDs, and operation IDs for every inserted block;
- advertises tools that the integration token cannot call;
- collapses deserialization failures into `Invalid tool arguments`.

A typical LinkedIn draft creation currently needs several discovery calls, one verbose operation batch, and a full read-back. The desired workflow is one compact query, one compact canonical mutation, and one compact verification.

## Goals

1. Reduce MCP response tokens without breaking existing clients.
2. Query ordered direct children, including database rows, with exact filters and bounded projections.
3. Read large pages in deterministic, bounded chunks.
4. Create related blocks with compact references while preserving the canonical operation protocol, idempotency, authorization, `seq`, LWW versions, and atomic ordering invariants.
5. Return mutation evidence sufficient for verification without forcing a full page read.
6. Advertise only tools supported by the integration token's scopes.
7. Return errors that an agent can correct without guessing.

## Non-goals

- Changing the Streamable HTTP transport or MCP protocol version.
- Removing or renaming existing tools.
- Changing Reason's block or operation domain contracts.
- Adding page-specific write shortcuts or direct SQL mutation paths.
- Replacing semantic search.
- Supporting arbitrary SQL or arbitrary JSONPath filters.
- Permanent deletion through MCP.
- Guaranteeing snapshot pagination across concurrent workspace writes. A changed workspace invalidates the cursor instead.
- Deploying to production as part of implementation. Deployment requires separate immediate confirmation.

## Compatibility strategy

All existing tool names and required arguments remain valid.

- Existing tools default to `response_mode: "legacy"` and preserve their current response representation.
- Existing tools that return JSON accept optional `response_mode: "compact"`.
- New query and compact mutation tools default to compact responses.
- Compact responses keep the full machine-readable value only in `structuredContent.result`; `content` contains a summary of at most 200 characters and never repeats user content.
- Legacy responses continue duplicating text and structured output until a future separately approved deprecation.

## User workflows

### Query database rows

A client can list the active `database_row` children of a known database, filter `properties.status == "todo"`, project only `id`, `type`, `parentId`, `title`, `status`, and `trashedAt`, and receive results in the database's `content` order.

### Read a bounded page tree

A client can read a page with selected fields, selected property keys, bounded depth, bounded serialized character count, and an opaque continuation cursor. It never receives a partial block.

### Create a row and children compactly

A client submits one `request_id`, assigns `client_ref: "post"` to a row insert, and uses `parent_ref: "post"` for paragraph inserts. The adapter derives deterministic UUIDs, builds canonical operations, and passes one atomic batch to `ApplyOperationUseCase`.

The response maps client references to generated block IDs and may return compact snapshots of affected blocks.

### Correct invalid input

An invalid field returns a stable error code plus the failing argument path and a short expected-value description.

### Discover tools

A read-only token does not receive mutation, media, semantic-search, or GitHub tool schemas unless its scopes allow those capabilities.

## MCP contracts

### Common response mode

Existing JSON-returning tools accept:

```json
{
  "response_mode": "legacy | compact"
}
```

In compact mode the MCP result is:

```json
{
  "content": [{ "type": "text", "text": "Returned 12 blocks." }],
  "structuredContent": { "result": {} },
  "isError": false
}
```

The summary must be at most 200 characters and must not contain serialized block properties, page text, credentials, URLs with secrets, or operation payloads.

### `reason_query_blocks`

Requires `content:read` and current workspace membership.

Input:

```json
{
  "workspace_id": "uuid",
  "parent_id": "uuid",
  "block_type": "database_row",
  "property_equals": {
    "status": "todo",
    "title": "Optional exact title"
  },
  "fields": ["id", "type", "parentId", "properties", "trashedAt"],
  "property_keys": ["title", "status"],
  "include_trashed": false,
  "limit": 50,
  "cursor": null
}
```

Rules:

- `parent_id` is required and must belong to the selected workspace.
- Results follow the parent's `content` array, never creation time or lexical order.
- `block_type` is optional and uses the public block type enum.
- `property_equals` accepts at most 8 top-level property keys with scalar JSON values only: string, number, boolean, or null.
- Exact property comparison uses PostgreSQL JSONB equality for the selected scalar value.
- `fields` accepts only `id`, `type`, `parentId`, `properties`, `content`, `propVersions`, `trashedAt`, and `trashedIndex`.
- `property_keys` limits the keys returned inside `properties`; it does not change filtering.
- `limit` defaults to 50 and is bounded to 1 through 100.
- `include_trashed` defaults to false. A live child beneath a trashed ancestor is not returned unless true.
- The cursor is opaque and binds the workspace, parent, workspace sequence, raw child-array position, and filter fingerprint.
- A changed workspace sequence returns `stale_cursor`; the client restarts at the first page.
- The response contains `items`, `next_cursor`, and `workspace_seq`. It does not run a total-count query.

### Compact `reason_read_page`

Optional arguments when `response_mode == "compact"`:

```json
{
  "fields": ["id", "type", "parentId", "properties", "trashedAt"],
  "property_keys": ["title", "text", "status"],
  "max_depth": 4,
  "max_chars": 20000,
  "cursor": null
}
```

Rules:

- Legacy mode rejects compact-only arguments rather than silently ignoring them.
- Traversal is deterministic preorder using each block's `content` order.
- `max_depth` defaults to 8 and is bounded to 0 through 32.
- `max_chars` defaults to 20,000 and is bounded to 1,000 through 100,000.
- Truncation happens only between blocks.
- The response contains projected page metadata, `blocks`, `next_cursor`, `workspace_seq`, and `truncated`.
- The cursor binds page ID, workspace sequence, traversal position, and projection fingerprint.
- A changed workspace sequence returns `stale_cursor`.

### `reason_apply_operations_compact`

Requires `content:write`, current membership, and a current `editor` or `owner` role. It does not introduce a new application write path.

Input:

```json
{
  "workspace_id": "uuid",
  "request_id": "uuid",
  "operations": [
    {
      "type": "insert_block",
      "client_ref": "post",
      "parent_id": "uuid",
      "index": 0,
      "block_type": "database_row",
      "properties": { "title": "Title", "status": "todo", "values": {} },
      "prop_versions": { "status": 1 }
    },
    {
      "type": "insert_block",
      "client_ref": "intro",
      "parent_ref": "post",
      "index": 0,
      "block_type": "paragraph",
      "properties": { "text": "Opening" }
    }
  ],
  "return_blocks": true,
  "return_fields": ["id", "type", "parentId", "properties", "trashedAt"],
  "return_property_keys": ["title", "status", "text"]
}
```

Rules:

- The batch contains 1 through 50 operations.
- `client_ref` is required and unique for inserts; it matches `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.
- A target uses exactly one of the relevant ID or reference fields.
- References resolve only to inserts earlier in the same batch.
- Insert metadata defaults are server-owned: `workspaceId`, generated `id`, empty `content`, `parentId`, `trashedAt: null`, and `trashedIndex: null`.
- Initial `propVersions` default to an empty map. Callers must provide versions when a database schema or product contract requires them.
- Update operations still require explicit `prop_versions`; the compact adapter never reads and increments LWW versions on the client's behalf.
- `request_id` plus zero-based operation position deterministically derives each canonical `opId`.
- `request_id` plus `client_ref` deterministically derives inserted block IDs.
- UUID derivation uses UUID v5 under a fixed Reason MCP namespace. Enabling the existing `uuid` crate's `v5` feature is part of the approved implementation; no new package is introduced.
- Reusing a request ID with changed operations reaches the existing canonical replay-conflict validation and fails without applying divergent content.
- The fully resolved operations are validated and sent as one batch through `ApplyOperationUseCase::execute_batch`.
- The adapter never writes blocks, operations, sequence numbers, or property versions directly.
- `return_blocks` defaults to false. When true, the server returns compact post-commit snapshots for blocks affected by the batch, bounded to 50 blocks and the requested projection.
- The response contains `acks`, `created` as a client-reference-to-UUID map, and optional `blocks`.

Compact update, move, delete, and restore inputs use the same canonical fields except for deterministic `opId`; they may target `block_id` or a prior `block_ref` where applicable.

### Scope-filtered tool catalog

`tools/list` receives the authenticated integration principal and returns:

- `reason_list_workspaces` always;
- content read tools only when the token has `content:read` for at least one grant;
- both operation tools only when it has `content:write`;
- semantic search only with `search:read`;
- image retrieval only with `media:read`;
- GitHub list only with `github:read`;
- GitHub linking only with both `github:read` and `github:write`.

Current membership and role are still revalidated on every tool call. Catalog filtering is not an authorization boundary.

### Structured errors

Tool failures keep `isError: true` and a concise text message. They also return:

```json
{
  "structuredContent": {
    "error": {
      "code": "invalid_arguments",
      "message": "Invalid tool arguments",
      "path": "operations[1].parent_ref",
      "expected": "a previously declared client_ref"
    }
  }
}
```

Stable initial codes:

- `invalid_arguments`
- `permission_denied`
- `not_found`
- `stale_cursor`
- `operation_conflict`
- `limit_exceeded`
- `unavailable`
- `internal_error`

Argument-path reporting may add `serde_path_to_error` as a named dependency. Internal database, storage, token, and provider details remain hidden.

## Architecture

### Application boundary

Add a focused read use case and page-repository port for ordered direct-child queries. It enforces membership before invoking the repository. Query filtering remains workspace-scoped in SQL.

Compact page projection, cursor validation, MCP result formatting, client-reference resolution, and canonical operation compilation belong to the MCP adapter unless reuse by another transport becomes real.

### PostgreSQL adapter

The direct-child query:

1. loads the parent under `workspace_id` and obtains its ordered `content` array;
2. validates the cursor against the current workspace sequence and filter fingerprint;
3. selects a bounded slice of candidate child IDs;
4. fetches only matching child rows under the same workspace;
5. restores parent-content order in the result;
6. advances the raw child position even when candidates fail filters.

It must not fetch another workspace's blocks and filter them in application memory.

### Canonical writes

The compact adapter compiles MCP-specific drafts to `domain::block::Operation`. The existing application use case remains the only mutation boundary. The resulting operation log, cursor assignment, transaction, WebSocket publication, embeddings, authorization, and undo semantics remain unchanged.

## Security and privacy

- All queries require an explicit granted workspace and current membership.
- Query SQL includes `workspace_id` and does not post-filter cross-tenant rows.
- Trashed ancestry rules match existing search and page visibility behavior.
- `content` summaries never echo private block text or tool arguments.
- Cursors are opaque URL-safe base64 JSON with a server HMAC signature using a dedicated configuration secret. They contain no user text.
- Cursor signing configuration is mandatory outside tests. No cursor signing key appears in logs or errors.
- Tool filtering reduces accidental invocation but never replaces per-call authorization.
- Compact operation IDs are deterministic but scoped by namespace, workspace, request ID, and operation position.

## Configuration and rollout

- Add `MCP_CURSOR_SIGNING_KEY` to configuration, `.env.example`, and deployment documentation.
- No database migration or backfill is required.
- Deploy backend before clients start requesting compact mode or new tools.
- Existing clients continue using legacy behavior without changes.
- Production variable changes and deployment require immediate user confirmation after implementation validation.

## Error and edge cases

- Unknown fields or incompatible argument combinations return `invalid_arguments` with a path.
- An empty compact operation batch returns `limit_exceeded`.
- Duplicate or forward client references return `invalid_arguments`.
- A request replay with identical content returns original canonical acknowledgements.
- A request replay with changed content returns `operation_conflict` and applies nothing new.
- A missing, cross-workspace, unauthorized, or inaccessible parent returns `not_found` or `permission_denied` without revealing existence across workspaces.
- A stale or tampered cursor returns `stale_cursor` or `invalid_arguments` without partial results.
- A single projected block larger than `max_chars` returns `limit_exceeded`; it is never split or silently omitted.
- Search indexing delay has no effect on exact block queries.

## Testing plan

### Unit tests

- Legacy and compact result envelopes.
- Compact summaries never contain serialized properties.
- Projection and property-key filtering.
- Cursor encode, signature validation, filter binding, continuation, stale sequence, and tampering.
- Scope-filtered tool names.
- Structured error codes and argument paths.
- UUID v5 derivation stability and workspace/request isolation.
- Client-reference ordering, duplicates, forward references, and resolution.
- Compact drafts compile to the exact expected canonical operations.
- Legacy operation schema remains unchanged.

### Application and repository tests

- Ordered direct-child query follows parent `content` order.
- Exact title/status filtering.
- Pagination advances over filtered-out children.
- Workspace isolation and current membership.
- Trashed child and trashed-ancestor behavior.
- Compact batch replay returns the same acknowledgements.
- Changed replay is rejected atomically.
- Post-commit snapshots contain only affected authorized blocks.

### Contract and client tests

- Read-only token does not receive write tools.
- Existing legacy MCP fixtures remain byte-compatible except for tool-list scope filtering.
- A compact database-row discovery needs one tool call.
- A compact 20-paragraph post payload is at least 35% smaller than the equivalent canonical payload.
- A compact 100-block page result envelope is at least 40% smaller than the legacy duplicated envelope.
- OpenCode can list rows, create a row with children, and verify it against a local stack using only the new compact tools.

### Delivery gates

Run focused Rust tests while iterating, then `make test`. Run the local MCP client acceptance scenario against the Compose stack. Production verification is out of scope until separately authorized.

## Acceptance criteria

1. Existing MCP clients can omit every new argument and retain legacy behavior.
2. `reason_query_blocks` returns exact filtered rows in parent order without semantic search.
3. Compact page reads are bounded, projected, resumable, and reject stale cursors.
4. Compact responses contain one machine-readable copy of result data.
5. Compact mutations resolve local references and use only canonical operation application.
6. Identical request replay is idempotent; changed replay is rejected atomically.
7. Mutation responses can verify affected blocks without a full page read.
8. Tool schemas are filtered by integration scopes.
9. Invalid arguments identify a stable code and failing path.
10. Token-size regression fixtures meet the 35% request and 40% response reductions.
11. Workspace isolation, authorization, trash behavior, LWW, ordering, `op_id`, and `seq` invariants remain covered.
12. Focused tests, `make test`, and local MCP client acceptance pass.

## Open questions

No blocking product questions remain. Production secret configuration and deployment timing are intentionally deferred to a separate confirmation.

## Implementation evidence

- Focused MCP contract tests cover compact envelopes, structured paths and codes, scope-filtered discovery, signed cursors, deterministic UUID v5 compilation, local references, post-commit snapshot safety, and request/response size regressions.
- PostgreSQL acceptance verified exact status filtering, raw-position pagination in parent `content` order, trashed-ancestor visibility, and workspace grant isolation against the Compose stack.
- Canonical compact mutation acceptance verified local-reference creation, affected-block snapshots, identical replay ACKs, divergent replay rejection with `operation_conflict`, and no divergent persisted content.
- Compact page acceptance verified projection, `max_chars` truncation, and a resumable signed cursor. A workspace write invalidated a query cursor with `stale_cursor`.
- OpenCode 1.18.10 connected to the local Streamable HTTP MCP endpoint using the versioned client contract.
- `make test`, `cargo fmt`, `git diff --check`, and `docker compose config --quiet` passed after the final implementation changes.
