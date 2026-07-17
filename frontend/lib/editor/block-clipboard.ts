import type {
  BlockProperties,
  BlockType,
  Operation,
} from "@reason/core/contracts"
import { newBlock, type BlockTree } from "@reason/core/engine/tree"
import { blockText } from "@/lib/editor/tree-view"

export const BLOCK_CLIPBOARD_MIME = "application/x-reason-blocks+json"
const MAX_CLIPBOARD_BLOCKS = 200
const MAX_CLIPBOARD_DEPTH = 20
const MAX_CLIPBOARD_BYTES = 1_000_000
const BLOCK_TYPES = new Set<BlockType>([
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
  "mermaid",
  "callout",
  "divider",
  "image",
])

export interface ClipboardBlock {
  type: BlockType
  properties: BlockProperties
  children: ClipboardBlock[]
}

export interface BlockClipboardPayload {
  version: 1
  blocks: ClipboardBlock[]
}

let fallbackClipboard: { payload: BlockClipboardPayload; text: string } | null =
  null

function serializeBlock(
  tree: BlockTree,
  blockId: string
): ClipboardBlock | null {
  const block = tree.blocks.get(blockId)
  if (!block || block.trashedAt) return null
  return {
    type: block.type,
    properties: { ...block.properties },
    children: block.content
      .map((childId) => serializeBlock(tree, childId))
      .filter((child): child is ClipboardBlock => child !== null),
  }
}

export function serializeBlocks(
  tree: BlockTree,
  rootIds: string[]
): BlockClipboardPayload {
  return {
    version: 1,
    blocks: rootIds
      .map((id) => serializeBlock(tree, id))
      .filter((block): block is ClipboardBlock => block !== null),
  }
}

function clipboardBlockText(block: ClipboardBlock): string {
  const own =
    typeof block.properties.text === "string"
      ? block.properties.text
      : typeof block.properties.title === "string"
        ? block.properties.title
        : ""
  return [own, ...block.children.map(clipboardBlockText)]
    .filter(Boolean)
    .join("\n")
}

export function clipboardPlainText(payload: BlockClipboardPayload) {
  return payload.blocks.map(clipboardBlockText).join("\n")
}

export function writeClipboardEvent(
  clipboard: DataTransfer,
  payload: BlockClipboardPayload
) {
  const text = clipboardPlainText(payload)
  clipboard.setData(BLOCK_CLIPBOARD_MIME, JSON.stringify(payload))
  clipboard.setData("text/plain", text)
  fallbackClipboard = { payload, text }
}

export async function writeNavigatorClipboard(payload: BlockClipboardPayload) {
  const text = clipboardPlainText(payload)
  fallbackClipboard = { payload, text }
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          [BLOCK_CLIPBOARD_MIME]: new Blob([JSON.stringify(payload)], {
            type: BLOCK_CLIPBOARD_MIME,
          }),
        }),
      ])
      return
    } catch {
      // Chromium may reject custom MIME types outside a secure context.
    }
  }
  await navigator.clipboard.writeText(text)
}

function parsePayload(value: string): BlockClipboardPayload | null {
  if (value.length > MAX_CLIPBOARD_BYTES) return null
  try {
    const parsed = JSON.parse(value) as BlockClipboardPayload
    if (parsed.version !== 1 || !Array.isArray(parsed.blocks)) return null
    let count = 0
    const validBlock = (
      block: unknown,
      depth: number
    ): block is ClipboardBlock => {
      if (
        depth > MAX_CLIPBOARD_DEPTH ||
        typeof block !== "object" ||
        block === null
      )
        return false
      const candidate = block as Partial<ClipboardBlock>
      if (
        typeof candidate.type !== "string" ||
        !BLOCK_TYPES.has(candidate.type as BlockType) ||
        typeof candidate.properties !== "object" ||
        candidate.properties === null ||
        Array.isArray(candidate.properties) ||
        !Array.isArray(candidate.children)
      )
        return false
      // URLs de imagem só são confiáveis quando vieram do clipboard interno
      // desta sessão; MIME externo não pode persistir requests arbitrárias.
      if (candidate.type === "image") return false
      count += 1
      return (
        count <= MAX_CLIPBOARD_BLOCKS &&
        candidate.children.every((child) => validBlock(child, depth + 1))
      )
    }
    if (!parsed.blocks.every((block) => validBlock(block, 1))) return null
    return parsed
  } catch {
    return null
  }
}

export function readClipboardEvent(clipboard: DataTransfer) {
  const encoded = clipboard.getData(BLOCK_CLIPBOARD_MIME)
  if (encoded) {
    if (
      fallbackClipboard &&
      encoded === JSON.stringify(fallbackClipboard.payload)
    )
      return fallbackClipboard.payload
    return parsePayload(encoded)
  }
  const text = clipboard.getData("text/plain")
  return fallbackClipboard?.text === text ? fallbackClipboard.payload : null
}

export function fallbackBlockClipboard() {
  return fallbackClipboard?.payload ?? null
}

export async function currentFallbackBlockClipboard() {
  if (!fallbackClipboard || !navigator.clipboard.readText) return null
  try {
    const text = await navigator.clipboard.readText()
    return text === fallbackClipboard.text ? fallbackClipboard.payload : null
  } catch {
    return null
  }
}

function payloadBlockCount(payload: BlockClipboardPayload) {
  let count = 0
  const visit = (block: ClipboardBlock, depth: number): boolean => {
    if (depth > MAX_CLIPBOARD_DEPTH || count >= MAX_CLIPBOARD_BLOCKS)
      return false
    count += 1
    return block.children.every((child) => visit(child, depth + 1))
  }
  return payload.blocks.every((block) => visit(block, 1)) ? count : null
}

export function createClipboardInsertOperations(
  payload: BlockClipboardPayload,
  parentId: string,
  index: number,
  workspaceId: string,
  createId: () => string
) {
  if (payloadBlockCount(payload) === null) return []
  const operations: Operation[] = []

  const append = (
    block: ClipboardBlock,
    targetParentId: string,
    targetIndex: number
  ) => {
    const id = createId()
    operations.push({
      type: "insert_block",
      opId: createId(),
      block: newBlock(block.type, { ...block.properties }, id, workspaceId),
      parentId: targetParentId,
      index: targetIndex,
    })
    block.children.forEach((child, childIndex) => append(child, id, childIndex))
  }

  payload.blocks.forEach((block, offset) =>
    append(block, parentId, index + offset)
  )
  return operations
}

export function selectedPlainText(tree: BlockTree, rootIds: string[]) {
  return rootIds
    .map((id) => tree.blocks.get(id))
    .filter((block) => Boolean(block))
    .map((block) => blockText(block!))
    .join("\n")
}
