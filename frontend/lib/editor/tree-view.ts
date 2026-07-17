import type { Block, BlockType } from "@reason/core/contracts"
import { getChildren, type BlockTree } from "@reason/core/engine/tree"

export interface VisibleBlock {
  block: Block
  depth: number
  parentId: string
  index: number
}

export const TEXT_BLOCK_TYPES: ReadonlySet<BlockType> = new Set([
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
])

export function blockText(block: Block): string {
  const value = block.properties.text
  return typeof value === "string" ? value : ""
}

export function visibleBlocks(
  tree: BlockTree,
  collapsed: ReadonlySet<string>
): VisibleBlock[] {
  const rows: VisibleBlock[] = []

  function walk(parentId: string, depth: number) {
    getChildren(tree, parentId).forEach((block, index) => {
      rows.push({ block, depth, parentId, index })
      if (block.type !== "toggle" || !collapsed.has(block.id))
        walk(block.id, depth + 1)
    })
  }

  walk(tree.rootId, 0)
  return rows
}

export function isTextBlock(block: Block): boolean {
  return TEXT_BLOCK_TYPES.has(block.type)
}

export function siblingIndex(tree: BlockTree, block: Block): number {
  if (!block.parentId) return -1
  const parent = tree.blocks.get(block.parentId)
  if (!parent) return -1
  return parent.content.indexOf(block.id)
}

export function isDescendantOf(
  tree: BlockTree,
  possibleDescendantId: string,
  ancestorId: string
): boolean {
  // Lookup tolerante: árvore assíncrona/sync pode ter parentId órfão no meio do drag.
  let current = tree.blocks.get(possibleDescendantId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true
    seen.add(current.id)
    current = tree.blocks.get(current.parentId)
  }
  return false
}
