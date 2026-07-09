# Contracts — protocolo de blocos e operações

Spec canônica do modelo de dados e das cinco operações. As implementações espelham este documento:

- TypeScript (cliente): `frontend/lib/contracts.ts` — tipos usados pelo editor e pelo engine local (`frontend/lib/engine/tree.ts`).
- Rust (servidor): `backend/src/domain/block.rs` — o apply do servidor reimplementa a mesma semântica, coberta pelos mesmos casos de teste.

A API HTTP está em [`docs/api/pages.md`](../docs/api/pages.md); o protocolo de sync em [`docs/api/sync.md`](../docs/api/sync.md).

Quando um segundo consumidor TypeScript existir (ex.: desktop client), promova `frontend/lib/contracts.ts` de volta a pacote compartilhado.

## Bloco

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `id` | uuid | Gerado no cliente. |
| `workspaceId` | uuid | Chave de partição de tudo. |
| `type` | enum | `page`, `paragraph`, `heading1..3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `quote`, `code`, `callout`, `divider`, `image`. |
| `properties` | json | Por tipo: `text`, `checked`, `language`, `title` (page), `icon` (page, um emoji). |
| `propVersions` | `{ [key]: number }` | Contadores LWW por propriedade; `_type` para mudança de tipo. |
| `content` | uuid[] | Filhos **vivos**, na ordem. `content` manda na ordem; `parentId` na pertinência. Os dois sempre concordam. |
| `parentId` | uuid \| null | Null só na raiz. |
| `trashedAt` | timestamp \| null | Soft delete. Bloco trashed sai do `content` do pai; descendentes ficam intactos. |
| `trashedIndex` | int \| null | Posição no pai no momento do delete; restore reinsere aqui (com clamp). |

Regra aprendida no M1 (coberta por fuzz test): delete NÃO pode deixar o id no `content` do pai como "fantasma" — o slot extra desloca os índices de ops `move` durante o undo e a árvore diverge.

## Operações

Toda op carrega `opId` (uuid do cliente, chave de idempotência no servidor).

| Op | Campos | Inversa (undo) |
| --- | --- | --- |
| `insert_block` | `block` (content vazio), `parentId`, `index` (clamp) | `delete_block` |
| `update_block` | `blockId`, `blockType?`, `properties?` (null remove a chave), `propVersions?` (LWW) | `update_block` com valores anteriores e versões `+1` |
| `move_block` | `blockId`, `newParentId`, `index` | `move_block` de volta à posição antiga |
| `delete_block` | `blockId` (raiz da subárvore) | `restore_block` |
| `restore_block` | `blockId` | `delete_block` |

Invariantes que o apply valida (nos dois lados): pai existe e não está trashed, sem ciclos em `move`, raiz não move nem vai ao trash, id duplicado em `insert` rejeitado, índices sofrem clamp.

Undo: aplicar uma op retorna sua inversa; o undo aplica inversas em ordem reversa e o redo é a inversa da inversa, calculada na hora. Rajadas de digitação coalescem num único passo (mesma `coalesceKey`).

## Persistência e sync (M2 + M3)

Cada bloco é uma linha em `blocks`; os campos do contrato mapeiam 1:1, em snake_case. `content` é `uuid[]`, `properties` e `prop_versions` são `jsonb`.

Todo workspace tem um **container** (`workspace_page_roots.root_page_id`), criado na mesma transação que o workspace: um bloco `page` invisível que é pai das páginas de topo.

Cada write vira uma linha em `operations` (`workspace_id`, `seq`, `op_id`, `actor_id`, `operation` jsonb):

- **Idempotência.** `(workspace_id, op_id)` é único. Reenviar a mesma op devolve o `{op_id, seq}` original sem reaplicar nada.
- **Cursor.** `seq` é monotônico por workspace (`workspaces.operation_seq`). Op rejeitada não consome `seq`.
- **Serialização.** O apply trava a linha do workspace com `SELECT … FOR UPDATE`, aplica no engine e persiste na mesma transação. Ops estruturais nunca se cruzam.
- **LWW por propriedade.** `propVersions[k] < stored[k]` → chave ignorada; `>=` aplica (empate: ordem de chegada). Sem versão na op → `stored + 1`.
- **Transporte.** Writes ainda vão por `POST /operations` (fila HTTP). Após o commit o servidor publica no WebSocket do workspace. Catch-up: `GET /operations?after_seq=`.
- **Broadcast.** Hub in-process (`RealtimeHub`); multi-instance troca o hub por Redis/NATS sem mudar o protocolo.

Uma página filha renderizada dentro do pai é um link, nunca conteúdo inline: o `GET /pages/{id}` para a descida na página filha e devolve o bloco dela com `content: []`.
