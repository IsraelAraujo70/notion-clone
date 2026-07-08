// Contrato compartilhado frontend/backend: modelo de bloco e as cinco operações.
// O backend Rust (M2) espelha estes tipos; este arquivo é a fonte da verdade.

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
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Propriedades por tipo (todas opcionais; o tipo do bloco decide o que é lido):
// text (todos os textuais), checked (to_do), language (code), title/icon (page).
export type BlockProperties = Record<string, JsonValue>;

export interface Block {
  id: string;
  workspaceId: string;
  type: BlockType;
  properties: BlockProperties;
  /** Ids dos filhos vivos, na ordem. `content` manda na ordem; `parentId` manda na pertinência. */
  content: string[];
  parentId: string | null;
  /** Soft delete. Bloco trashed sai do `content` do pai; descendentes ficam intactos. */
  trashedAt: string | null;
  /** Posição no pai no momento do delete; restore reinsere aqui (com clamp). */
  trashedIndex: number | null;
}

interface OpBase {
  /** Uuid gerado no cliente. Chave de idempotência no servidor (M3). */
  opId: string;
}

export interface InsertBlockOp extends OpBase {
  type: "insert_block";
  /** Snapshot completo do bloco novo (content vazio; filhos entram por ops próprias). */
  block: Block;
  parentId: string;
  index: number;
}

export interface UpdateBlockOp extends OpBase {
  type: "update_block";
  blockId: string;
  /** Virar outro tipo de bloco é um patch em `blockType`. Sem migração de dados. */
  blockType?: BlockType;
  /** Patch por propriedade; `null` remove a propriedade. */
  properties?: Record<string, JsonValue | null>;
  /** Versões por propriedade para LWW no servidor (M3). Ignorado no M1. */
  propVersions?: Record<string, number>;
}

export interface MoveBlockOp extends OpBase {
  type: "move_block";
  blockId: string;
  newParentId: string;
  index: number;
}

export interface DeleteBlockOp extends OpBase {
  type: "delete_block";
  blockId: string;
}

export interface RestoreBlockOp extends OpBase {
  type: "restore_block";
  blockId: string;
}

export type Operation =
  | InsertBlockOp
  | UpdateBlockOp
  | MoveBlockOp
  | DeleteBlockOp
  | RestoreBlockOp;
