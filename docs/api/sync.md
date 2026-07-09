# Sync API (M3)

Auth: `Authorization: Bearer <session>` on REST; WebSocket uses `?token=`
(browsers cannot set Authorization on the handshake). Membership required on
every path.

## `GET /workspaces/{workspace_id}/operations?after_seq=&limit=&up_to_seq=`

Catch-up for reconnection. Returns ops with `after_seq < seq <= latest_seq`,
ascending, capped per page (default 500, max 1000). The first request omits
`up_to_seq`; its `latest_seq` freezes a snapshot bound. Every later page sends
that bound as `up_to_seq`, so writes that arrive during recovery do not move the
target forever.

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

`latest_seq` is the stable upper bound for this pagination run, including when
the page is empty. If the last returned `seq` is still lower, the client requests
another page. An empty page before the bound is a protocol error, not success.

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
| `presence_snapshot` | `{ peers: PresencePeer[] }` right after hello |
| `presence_update` | `{ peer }` when someone joins/moves focus |
| `presence_leave` | `{ connection_id }` when a socket closes |

Client → server:

| type | payload |
| --- | --- |
| `presence` | `{ page_id?, focused_block_id? }` |

`PresencePeer`: `{ connection_id, user_id, display_name, avatar_url?, page_id?, focused_block_id?, color, last_seen }`.
Presence is ephemeral (in-memory hub), not part of the op log.

On reconnect: wait for WS `hello` (the server subscription already exists), then
`GET .../operations?after_seq=<lastContiguousSeq>`. Live events received during
catch-up stay in a sequence buffer. The client applies only `cursor + 1`, ignores
duplicates at or below the cursor, and fetches the log again if the buffer shows
a gap. An HTTP write ACK never advances this delivery cursor by itself.

If the server-side broadcast receiver lags, the socket closes. Reconnect plus the
durable operation log is the recovery path; silently skipping lost broadcasts is
not allowed.

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
2. Open WS; after `hello`, catch up from `seq`, paginating to a frozen `latest_seq`
3. Local edits: optimistic apply + HTTP POST (op queue); track `opId`s to ignore echo
4. Buffer remote events and drain strictly by contiguous `seq`; operations for other pages advance the cursor without mutating the loaded tree
5. Refresh the sidebar when a page title/icon/structure operation applies

Verification: `make eval-sync-catch-up` creates 501 missed operations, adds more
writes after the first page, and proves the frozen snapshot has no gaps or duplicates.
