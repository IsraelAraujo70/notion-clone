import type { Block, BlockType } from "@/lib/contracts"
import { getBlock, getChildren, type BlockTree } from "@/lib/engine/tree"

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
  return getBlock(tree, block.parentId).content.indexOf(block.id)
}

export function isDescendantOf(
  tree: BlockTree,
  possibleDescendantId: string,
  ancestorId: string
): boolean {
  let current = getBlock(tree, possibleDescendantId)
  const seen = new Set<string>()
  while (current.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true
    seen.add(current.id)
    current = getBlock(tree, current.parentId)
  }
  return false
}
