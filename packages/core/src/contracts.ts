// Contrato compartilhado entre clientes e backend para blocos e operações.
// O backend Rust espelha estes tipos; este arquivo é a fonte da verdade.

export const BLOCK_TYPES = [
  "page",
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "quote",
  "code",
  "callout",
  "divider",
  "image",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// Propriedades por tipo (todas opcionais; o tipo do bloco decide o que é lido):
// text (textuais), checked (to_do), language (code), title/icon (page),
// url/key/caption (image).
export type BlockProperties = Record<string, JsonValue>

/** Versão LWW sintética para mudança de `type` (não colide com props do produto). */
export const TYPE_PROP_VERSION_KEY = "_type"

export interface Block {
  id: string
  workspaceId: string
  type: BlockType
  properties: BlockProperties
  /** Contadores LWW por chave de propriedade (e `_type` para mudança de tipo). */
  propVersions?: Record<string, number>
  /** Ids dos filhos vivos, na ordem. `content` manda na ordem; `parentId` manda na pertinência. */
  content: string[]
  parentId: string | null
  /** Soft delete. Bloco trashed sai do `content` do pai; descendentes ficam intactos. */
  trashedAt: string | null
  /** Posição no pai no momento do delete; restore reinsere aqui (com clamp). */
  trashedIndex: number | null
}

interface OpBase {
  /** Uuid gerado no cliente. Chave de idempotência no servidor. */
  opId: string
}

export interface InsertBlockOp extends OpBase {
  type: "insert_block"
  /** Snapshot completo do bloco novo (content vazio; filhos entram por ops próprias). */
  block: Block
  parentId: string
  index: number
}

export interface UpdateBlockOp extends OpBase {
  type: "update_block"
  blockId: string
  /** Virar outro tipo de bloco é um patch em `blockType`. Sem migração de dados. */
  blockType?: BlockType
  /** Patch por propriedade; `null` remove a propriedade. */
  properties?: Record<string, JsonValue | null>
  /** Versões por propriedade para LWW no servidor. */
  propVersions?: Record<string, number>
}

export interface MoveBlockOp extends OpBase {
  type: "move_block"
  blockId: string
  newParentId: string
  index: number
}

export interface DeleteBlockOp extends OpBase {
  type: "delete_block"
  blockId: string
}

export interface RestoreBlockOp extends OpBase {
  type: "restore_block"
  blockId: string
}

/** Face da transferência aplicada no workspace de origem. */
export interface TransferSubtreeOutOp extends OpBase {
  type: "transfer_subtree_out"
  transferId: string
  blockId: string
  destinationWorkspaceId: string
}

/** Face da transferência aplicada no workspace de destino. */
export interface TransferSubtreeInOp extends OpBase {
  type: "transfer_subtree_in"
  transferId: string
  blocks: Block[]
  parentId: string
  index: number
  sourceWorkspaceId: string
}

export type Operation =
  | InsertBlockOp
  | UpdateBlockOp
  | MoveBlockOp
  | DeleteBlockOp
  | RestoreBlockOp
  | TransferSubtreeOutOp
  | TransferSubtreeInOp

export type OperationGroupMetadata = {
  group_id: string
  group_ordinal: number
  source: string
  initiated_by: string
  provenance?: JsonValue
}
