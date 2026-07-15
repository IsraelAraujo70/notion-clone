# Pages API (M2)

All routes require `Authorization: Bearer <session token>` and workspace
membership. Reads need any role; writes need `owner` or `editor`. Cross-workspace
transfers require `owner` in both workspaces.

Block and operation payloads use camelCase (they are the `contracts/` types
verbatim). Envelopes reuse the snake_case shape of the rest of the API.

| Status | When |
| --- | --- |
| 403 | Non-member on any route; `viewer` on `POST /operations` |
| 404 | Page missing, trashed, or in another workspace |
| 422 | Operation rejected by the block engine (cycle, root delete, unknown block, duplicate id) |

## `GET /workspaces/{workspace_id}/pages`

Sidebar tree. Ordered by the editor's own block order (depth-first over `content`).

`root_page_id` is the workspace **container**: an invisible `page` block that
parents the top-level pages. It never appears in `pages`, `GET /pages/{container}`
returns 404, and it is the only block with no parent — so it can be neither
trashed nor moved. To create a top-level page, `insert_block` a `page` under it.
Top-level pages have `parent_page_id: null`.

```json
{
  "root_page_id": "1a55…",
  "pages": [
    { "id": "0d3b…", "title": "Notas de lançamento", "icon": "🚀", "parent_page_id": null },
    { "id": "77af…", "title": "Sub-página", "icon": "", "parent_page_id": "0d3b…" }
  ]
}
```

## `GET /workspaces/{workspace_id}/pages/{page_id}`

Page subtree in one round trip. The walk **stops at nested page blocks**: a child
page arrives as a block with `content: []`, and the editor renders it as a link.

`seq` is the workspace's operation cursor at read time (the catch-up cursor in M3).

`recent_editors` (optional array, max 5) lists users who recently applied ops
that touched this page:

```json
{
  "recent_editors": [
    {
      "user_id": "…",
      "display_name": "Israel",
      "avatar_url": "…",
      "last_edited_at": "2026-07-09T12:00:00Z"
    }
  ]
}
```

```json
{
  "page": {
    "rootId": "0d3b…",
    "blocks": [
      {
        "id": "0d3b…",
        "workspaceId": "9c11…",
        "type": "page",
        "properties": { "title": "Notas de lançamento", "icon": "🚀" },
        "content": ["4e02…", "77af…"],
        "parentId": null,
        "trashedAt": null,
        "trashedIndex": null
      },
      {
        "id": "4e02…",
        "workspaceId": "9c11…",
        "type": "paragraph",
        "properties": { "text": "Toda edição é uma operação." },
        "content": [],
        "parentId": "0d3b…",
        "trashedAt": null,
        "trashedIndex": null
      },
      {
        "id": "77af…",
        "workspaceId": "9c11…",
        "type": "page",
        "properties": { "title": "Sub-página" },
        "content": [],
        "parentId": "0d3b…",
        "trashedAt": null,
        "trashedIndex": null
      }
    ]
  },
  "breadcrumbs": [{ "id": "0d3b…", "title": "Notas de lançamento", "icon": "🚀" }],
  "seq": 6
}
```

## `POST /workspaces/{workspace_id}/operations`

One operation per request. The body is a `contracts/` `Operation`.

```json
{
  "type": "insert_block",
  "opId": "8f2c…",
  "parentId": "0d3b…",
  "index": 99,
  "block": {
    "id": "b7d1…",
    "workspaceId": "ignored, the server uses the path workspace",
    "type": "heading1",
    "properties": { "text": "Tarefas" },
    "content": [],
    "parentId": null,
    "trashedAt": null,
    "trashedIndex": null
  }
}
```

```json
{ "op_id": "8f2c…", "seq": 4 }
```

Semantics:

- The workspace row is locked `FOR UPDATE`, so structural operations never interleave.
- `opId` is the idempotency key. A replay returns the original `{op_id, seq}` and
  changes nothing — no duplicate block, no new `seq`.
- `index` is clamped to `[0, len(parent.content)]`.
- A rejected operation consumes no `seq` and writes no row.
- `block.workspaceId` and `block.parentId` in an `insert_block` are overwritten
  from the path and from `parentId`.

Other operations:

```json
{ "type": "update_block", "opId": "…", "blockId": "…", "blockType": "to_do",
  "properties": { "text": "Persistir blocos", "checked": false } }

{ "type": "move_block", "opId": "…", "blockId": "…", "newParentId": "…", "index": 1 }

{ "type": "delete_block", "opId": "…", "blockId": "…" }

{ "type": "restore_block", "opId": "…", "blockId": "…" }
```

A page block carries `title` and, optionally, `icon` (a single emoji). Renaming a
page, setting its icon, and moving it to the trash are just `update_block` /
`delete_block` on the page block — there is no page-specific endpoint.

`properties` is a patch: `null` removes the key. `propVersions` drives
property-level LWW (see [`sync.md`](./sync.md)): lower versions for a key are
skipped; equal or higher apply; missing versions bump `stored + 1`.

## `POST /workspaces/{workspace_id}/pages/{page_id}/transfer`

Moves a live page and its complete subtree to the top level of another workspace.
The caller must own both workspaces. `transfer_id` is the idempotency key.

```json
{
  "destination_workspace_id": "c22e…",
  "transfer_id": "68be…"
}
```

```json
{
  "transfer_id": "68be…",
  "source_seq": 19,
  "destination_seq": 7
}
```

The database move and both operation-log entries commit atomically. Existing
public links in the transferred subtree are revoked, embeddings are regenerated
under the destination workspace, and connected clients receive the corresponding
`transfer_subtree_out` or `transfer_subtree_in` event. These two server-generated
operations are rejected by the generic `POST /operations` route and do not enter
the editor's local undo history.

## `GET /workspaces/{workspace_id}/trash`

Only the **roots** of trashed subtrees. Descendants stay attached and come back
together on `restore_block`.

```json
[
  {
    "id": "c40a…",
    "type": "paragraph",
    "title": "filho",
    "trashed_at": "2026-07-08T18:31:02.114Z"
  }
]
```

## Verification

`make eval-page-persistence` drives every route above against a live API: it signs
up, applies the five operations, re-reads the page and compares the exact tree,
replays an `opId`, and checks the 403/422 paths.
