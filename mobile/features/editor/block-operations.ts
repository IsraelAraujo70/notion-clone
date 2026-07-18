import type {
  BlockType,
  InsertBlockOp,
  Operation,
} from "@reason/core/contracts"
import type { BlockTree } from "@reason/core/engine/tree"

export const MOBILE_BLOCK_TYPES: Array<{
  type: BlockType
  label: string
  icon: string
}> = [
  { type: "paragraph", label: "Texto", icon: "format-paragraph" },
  { type: "heading1", label: "Titulo 1", icon: "format-header-1" },
  { type: "heading2", label: "Titulo 2", icon: "format-header-2" },
  { type: "heading3", label: "Titulo 3", icon: "format-header-3" },
  { type: "bulleted_list_item", label: "Lista", icon: "format-list-bulleted" },
  {
    type: "numbered_list_item",
    label: "Numerada",
    icon: "format-list-numbered",
  },
  { type: "to_do", label: "Tarefa", icon: "checkbox-marked-outline" },
  { type: "toggle", label: "Toggle", icon: "chevron-right" },
  { type: "quote", label: "Citacao", icon: "format-quote-close" },
  { type: "code", label: "Codigo", icon: "code-tags" },
  { type: "mermaid", label: "Mermaid", icon: "graph-outline" },
  { type: "callout", label: "Destaque", icon: "lightbulb-outline" },
]

export function duplicateSubtreeOperations(
  tree: BlockTree,
  blockId: string,
  createId: () => string
): Operation[] {
  const source = tree.blocks.get(blockId)
  if (!source?.parentId) return []
  const parent = tree.blocks.get(source.parentId)
  if (!parent) return []

  const idMap = new Map<string, string>()
  const collect = (id: string) => {
    const block = tree.blocks.get(id)
    if (!block) return
    idMap.set(id, createId())
    for (const childId of block.content) collect(childId)
  }
  collect(blockId)

  const operations: InsertBlockOp[] = []
  const append = (id: string, destinationParentId: string, index: number) => {
    const block = tree.blocks.get(id)
    const copiedId = idMap.get(id)
    if (!block || !copiedId) return
    operations.push({
      type: "insert_block",
      opId: createId(),
      parentId: destinationParentId,
      index,
      block: {
        ...block,
        id: copiedId,
        properties: { ...block.properties },
        propVersions: {},
        content: [],
        parentId: null,
        trashedAt: null,
        trashedIndex: null,
      },
    })
    block.content.forEach((childId, childIndex) =>
      append(childId, copiedId, childIndex)
    )
  }

  append(blockId, parent.id, parent.content.indexOf(blockId) + 1)
  return operations
}

export function indentOperation(
  tree: BlockTree,
  blockId: string,
  createId: () => string
): Operation | null {
  const block = tree.blocks.get(blockId)
  if (!block?.parentId) return null
  const parent = tree.blocks.get(block.parentId)
  if (!parent) return null
  const index = parent.content.indexOf(blockId)
  const previousId = parent.content[index - 1]
  const previous = previousId ? tree.blocks.get(previousId) : null
  if (
    !previous ||
    previous.type === "divider" ||
    previous.type === "image" ||
    previous.type === "database"
  ) {
    return null
  }
  return {
    type: "move_block",
    opId: createId(),
    blockId,
    newParentId: previous.id,
    index: previous.content.length,
  }
}

export function outdentOperation(
  tree: BlockTree,
  blockId: string,
  createId: () => string
): Operation | null {
  const block = tree.blocks.get(blockId)
  if (!block?.parentId || block.parentId === tree.rootId) return null
  const parent = tree.blocks.get(block.parentId)
  if (!parent?.parentId) return null
  const grandparent = tree.blocks.get(parent.parentId)
  if (!grandparent) return null
  return {
    type: "move_block",
    opId: createId(),
    blockId,
    newParentId: grandparent.id,
    index: grandparent.content.indexOf(parent.id) + 1,
  }
}
