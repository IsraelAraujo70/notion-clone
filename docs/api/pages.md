# Pages API (M2)

All routes require `Authorization: Bearer <session token>` and workspace
membership. Reads need any role; writes need `owner` or `editor`.

Block and operation payloads use camelCase (they are the `contracts/` types
verbatim). Envelopes reuse the snake_case shape of the rest of the API.

| Status | When |
| --- | --- |
| 403 | Non-member on any route; `viewer` on `POST /operations` |
| 404 | Page missing, trashed, or in another workspace |
| 422 | Operation rejected by the block engine (cycle, root delete, unknown block, duplicate id) |

## `GET /workspaces/{workspace_id}/pages`

Sidebar tree. Ordered by the editor's own block order (depth-first over `content`).

```json
{
  "root_page_id": "0d3b…",
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

`properties` is a patch: `null` removes the key. `propVersions` is accepted and
ignored until M3 (property-level LWW).

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
