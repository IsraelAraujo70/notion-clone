# Contracts — protocolo de blocos e operações

Spec canônica do modelo de dados e das cinco operações. As implementações espelham este documento:

- TypeScript (cliente): `frontend/lib/contracts.ts` — tipos usados pelo editor e pelo engine local.
- Rust (servidor, a partir do M2): structs em `backend/src/` — o apply do servidor reimplementa a mesma semântica, coberta pelos mesmos casos de teste.

Quando um segundo consumidor TypeScript existir (ex.: desktop client), promova `frontend/lib/contracts.ts` de volta a pacote compartilhado.

## Bloco

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `id` | uuid | Gerado no cliente. |
| `workspaceId` | uuid | Chave de partição de tudo. |
| `type` | enum | `page`, `paragraph`, `heading1..3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `quote`, `code`, `callout`, `divider`. |
| `properties` | json | Por tipo: `text`, `checked`, `language`, `title`, `icon`. |
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
| `update_block` | `blockId`, `blockType?`, `properties?` (null remove a chave), `propVersions?` (LWW, M3) | `update_block` com valores anteriores |
| `move_block` | `blockId`, `newParentId`, `index` | `move_block` de volta à posição antiga |
| `delete_block` | `blockId` (raiz da subárvore) | `restore_block` |
| `restore_block` | `blockId` | `delete_block` |

Invariantes que o apply valida (nos dois lados): pai existe e não está trashed, sem ciclos em `move`, raiz não move nem vai ao trash, id duplicado em `insert` rejeitado, índices sofrem clamp.

Undo: aplicar uma op retorna sua inversa; o undo aplica inversas em ordem reversa e o redo é a inversa da inversa, calculada na hora. Rajadas de digitação coalescem num único passo (mesma `coalesceKey`).
