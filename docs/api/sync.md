# Sync API (M3)

Auth: `Authorization: Bearer <session>` on REST; WebSocket uses `?token=`
(browsers cannot set Authorization on the handshake). Membership required on
every path.

## `GET /workspaces/{workspace_id}/operations?after_seq=&limit=`

Catch-up for reconnection. Returns ops with `seq > after_seq`, ascending, capped
(default 500, max 1000).

```json
{
  "operations": [
    {
      "seq": 4,
      "op_id": "8f2c…",
      "actor_id": "…",
      "operation": { "type": "update_block", "opId": "8f2c…", "blockId": "…", "properties": { "text": "oi" }, "propVersions": { "text": 2 } }
    }
  ],
  "latest_seq": 12
}
```

`latest_seq` is the workspace cursor even when the page is empty (client is
already caught up).

## `POST /workspaces/{workspace_id}/operations`

Unchanged from M2: one op per request, idempotent by `opId`, returns
`{ op_id, seq }`. After commit the server **broadcasts** the op on the workspace
WebSocket so other clients do not need to poll.

## `WS /workspaces/{workspace_id}/ws?token=`

Server → client messages (JSON, tagged `type`):

| type | payload |
| --- | --- |
| `hello` | `{ latest_seq }` |
| `op` | `{ event: { workspace_id, seq, op_id, actor_id, operation } }` |
| `ping` | `{}` every ~25s (Railway idle timeout) |

Client may send anything (ignored for now) or close. On reconnect: open WS, then
`GET .../operations?after_seq=<lastAcked>` and apply in order before trusting the
live stream. Clients ignore their own echo by `op_id`.

## Property-level LWW

Each block stores `propVersions: { [key]: number }` (and `_type` for type changes).
An `update_block` may include `propVersions` for the keys it writes:

- `opVersion < stored` → that key is **skipped**
- `opVersion >= stored` → apply and set stored to `opVersion` (ties: arrival order, already serialized per workspace)
- missing `propVersions` for a key → treated as `stored + 1` (compat with M2 scripts)

Structural ops (`insert` / `move` / `delete` / `restore`) stay serialized by the
workspace `FOR UPDATE` lock; they do not use property versions.

## Client flow

1. `GET /pages/{id}` → tree + `seq`
2. Open WS; on `open` / after load, catch-up from `seq`
3. Local edits: optimistic apply + HTTP POST (op queue); track `opId`s to ignore echo
4. Remote `op` events: apply if the block/parent is in the loaded subtree; refresh sidebar when a page title/icon/structure changes
