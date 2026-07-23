---
name: reason-mcp
description: Use the Reason MCP to list workspaces and pages, read or search notes, inspect images, and safely create, edit, move, delete, or restore blocks. Use when the user mentions Reason, "buscar no Reason", "ler nota", "criar página", "editar nota", or asks Codex to find, summarize, organize, or modify Reason content through reason_list_workspaces, reason_list_pages, reason_read_page, reason_search, reason_get_image, or reason_apply_operations.
---

# Reason MCP

Use the Reason MCP as the only path for reading and mutating the user's Reason content. Do not call the Reason database, S3 bucket, internal HTTP routes, or operation repository directly.

## Preconditions

The production MCP endpoint is:

```text
https://api.reason.israeldeveloper.com.br/mcp
```

The Codex configuration should reference an environment variable rather than containing the token:

```toml
[mcp_servers.reason]
url = "https://api.reason.israeldeveloper.com.br/mcp"
bearer_token_env_var = "REASON_MCP_TOKEN"
```

Never put a real `rsn_mcp_...` token in this skill, source control, command output, or chat. In this repository, the canonical credential is `REASON_MCP_TOKEN` in the root `.env`, which is ignored by Git. Load that file into the process environment before starting or diagnosing OpenCode; never print its value. The project `opencode.json` reads the credential through `{env:REASON_MCP_TOKEN}`.

For every OpenCode CLI invocation from this repository, extract only the MCP token in the same shell command. Do not `source .env`: other application values may contain shell-significant characters.

```bash
export REASON_MCP_TOKEN="$(ruby -ne 'print $1.strip if /^REASON_MCP_TOKEN=(.*)$/' .env)"; npx --yes opencode-ai <command>
```

OpenCode configuration and environment variables are loaded at startup. After changing `.env`, restart OpenCode before using the injected `reason_*` tools.

## OpenCode Client Recovery

If OpenCode Desktop does not inject the `reason_*` tools into the current session, do not stop after asking for repeated restarts and do not bypass MCP with direct HTTP. Diagnose and recover through the official OpenCode CLI, which loads the same `opencode.json` and MCP configuration.

1. Read the token from the project `.env` and confirm it exists without printing it:

   ```bash
   export REASON_MCP_TOKEN="$(ruby -ne 'print $1.strip if /^REASON_MCP_TOKEN=(.*)$/' .env)"; test -n "$REASON_MCP_TOKEN"
   ```

2. Verify the MCP handshake from the project directory:

   ```bash
   export REASON_MCP_TOKEN="$(ruby -ne 'print $1.strip if /^REASON_MCP_TOKEN=(.*)$/' .env)"; npx --yes opencode-ai mcp list
   ```

3. If `reason` reports `connected`, execute the user's request with `opencode run`. The prompt must explicitly require only the Reason MCP tools and forbid direct HTTP, database, storage, shell-based Reason access, and file edits:

   ```bash
   export REASON_MCP_TOKEN="$(ruby -ne 'print $1.strip if /^REASON_MCP_TOKEN=(.*)$/' .env)"; npx --yes opencode-ai run --pure \
      "Use exclusively the reason MCP tools. Do not use direct HTTP, the database, storage, shell access to Reason data, or file edits. <precise user request>"
   ```

4. Use `--auto` only when the user explicitly authorized the requested mutation and the prompt narrowly identifies the workspace, page, operation, and verification step.
5. Require the CLI agent to read the target first, use canonical `reason_apply_operations`, re-read after a mutation, and return the resulting page ID or concise evidence.

This fallback is still a real MCP client test. Direct calls to the Reason application API remain forbidden.

## Available Tools

| Tool | Purpose | Required scope |
| --- | --- | --- |
| `reason_list_workspaces` | Discover granted workspaces and current roles. | Any granted scope |
| `reason_list_pages` | List pages and obtain `root_page_id`. | `content:read` |
| `reason_read_page` | Read the ordered block tree and property versions. | `content:read` |
| `reason_search` | Semantic search over one workspace. | `search:read` |
| `reason_get_image` | Return one authorized image block as multimodal content. | `media:read` |
| `reason_apply_operations` | Atomically apply 1 to 50 typed block operations. | `content:write` and editor/owner role |

## Standard Workflow

1. Call `reason_list_workspaces` unless the workspace ID is already reliable in the current conversation.
2. Resolve the target workspace by exact name or ask the user when multiple workspaces are plausible.
3. Choose the narrowest discovery tool:
   - Use `reason_list_pages` to browse known page titles or obtain the workspace root.
   - Use `reason_search` when the user describes content by meaning or partial subject.
4. Call `reason_read_page` before summarizing a page or changing existing blocks. Search snippets are evidence for discovery, not a replacement for reading the page.
5. Use `reason_get_image` only with a `block_id` returned by Reason. Never invent or request an S3 key.
6. For mutations, construct canonical operations, review invariants, then call `reason_apply_operations`.
7. Report what was read or changed. Include page names and concise outcomes; expose UUIDs only when they help troubleshooting or a follow-up operation.

## Reading And Search

- Search is semantic. Use a concise natural-language query with meaningful nouns; do not paste the user's entire request.
- Start with a small result limit, usually 5 to 10. Increase only when needed.
- Search is scoped to one workspace. Never merge results across workspaces without the user's request.
- After selecting a search result, read its `page_id` with `reason_read_page` before answering detailed questions.
- Respect trashed or missing content. Do not try alternate IDs to bypass a not-found response.
- A page is a block. Its descendants are ordinary blocks ordered by the parent's `content` array.

## Images

1. Read or search the page to locate an image block.
2. Pass the returned `workspace_id` and `block_id` to `reason_get_image`.
3. Use the MCP image content for visual analysis and the metadata for caption/page context.
4. Do not return base64 to the user or write it to disk unless explicitly requested.
5. If `media:read` is missing, explain which scope is required. Do not fall back to storage URLs.

## Mutations

All writes must use `reason_apply_operations`. Supported operation types are:

- `insert_block`
- `update_block`
- `move_block`
- `delete_block`
- `restore_block`

Never send transfer operations or invent page-specific write tools.

### Idempotency

- Generate a new UUID `opId` for every new logical operation.
- Reuse the same `opId` when retrying that operation after a timeout or uncertain response.
- Never reuse an accepted `opId` for different content.
- A batch may contain 1 to 50 operations and is applied atomically.

### Insert A Page Or Note

Call `reason_list_pages` to obtain `root_page_id`. Insert the page block under that root:

```json
{
  "type": "insert_block",
  "opId": "new-operation-uuid",
  "block": {
    "id": "new-page-uuid",
    "workspaceId": "target-workspace-uuid",
    "type": "page",
    "properties": {
      "title": "Page title",
      "icon": ""
    },
    "propVersions": {
      "title": 1,
      "icon": 1
    },
    "content": [],
    "parentId": "root-page-uuid",
    "trashedAt": null,
    "trashedIndex": null
  },
  "parentId": "root-page-uuid",
  "index": 0
}
```

Add child paragraphs or headings as separate `insert_block` operations. Their `parentId` must be the new page ID, and each new block starts with an empty `content` array.

### Insert A Visible Database

The workspace root is not a visible block canvas. The sidebar and
`reason_list_pages` expose page blocks, not database blocks inserted directly
under `root_page_id`.

To create a database that users can see:

1. Resolve an existing visible page or create a page under `root_page_id`.
2. Read that page and insert the database as its child.
3. Insert database rows under the database block.
4. Re-read the visible parent page and verify the database appears as a direct
   child.
5. Re-read the created row and verify its descendants.

Never insert a user-facing database directly under `root_page_id`. It may be
persisted correctly while remaining absent from the sidebar and page UI.

### Update Existing Content

1. Read the page immediately before editing.
2. Find the exact target `blockId`.
3. Patch only the properties the user asked to change.
4. For each changed property, send a `propVersions` value greater than the current value. Normally use current value plus one.
5. Use `null` only when intentionally removing a property.

Example:

```json
{
  "type": "update_block",
  "opId": "new-operation-uuid",
  "blockId": "existing-block-uuid",
  "properties": {
    "text": "Updated text"
  },
  "propVersions": {
    "text": 4
  }
}
```

Do not patch `content` or `parentId`. Use `move_block` to change membership or ordering.

### Move, Delete, And Restore

- `move_block` requires `blockId`, `newParentId`, and zero-based `index`.
- Confirm before deleting a page, a large subtree, or content whose target is ambiguous.
- Use `delete_block` for soft deletion and `restore_block` to restore it. Do not attempt permanent deletion through MCP.
- Never move a block across workspaces with these tools.

## Invariants Checklist

Before every write, verify:

- Every block and parent belongs to the selected workspace.
- New block IDs and new operation IDs are unique UUIDs.
- New blocks have empty `content`; descendants are inserted separately.
- The operation `parentId` matches the new block's `parentId`.
- Child order changes use `move_block`, not property patches.
- Property versions increase only for changed properties.
- The requested action is allowed by the current workspace role.
- Destructive or broad changes match the user's explicit intent.

## Error Handling

- Desktop tools unavailable: follow **OpenCode Client Recovery** before asking for another restart. If `mcp list` reports connected, complete the request through `opencode run` using only `reason_*` tools.
- CLI reports disconnected: inspect OpenCode MCP configuration and confirm token presence without printing it; only then ask the user to restart or fix credentials.
- Permission error: identify the missing scope or required workspace role without asking for the token.
- Workspace absent from `reason_list_workspaces`: ask the user to grant it in **Configurações > Integrações**.
- Search unavailable: use page listing and targeted reads if practical; do not claim semantic results.
- Timeout during mutation: retry with the exact same operation payload and `opId`.
- Validation or conflict error: re-read the page, recompute IDs/indexes/property versions, and submit a corrected operation with a new `opId` only if the original operation was definitively rejected.
- Partial understanding: stop and ask one focused question rather than modifying the wrong page or block.

## Response Style

Keep user-facing responses concise:

- Reading: state which page/workspace was consulted and answer the question.
- Search: name the most relevant pages and distinguish direct content from inference.
- Mutation: summarize created, edited, moved, deleted, or restored blocks and mention any skipped action.
- Never expose access tokens, Authorization headers, raw base64, or unrelated private note content.
