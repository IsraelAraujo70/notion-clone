import type { Operation } from "@reason/core/contracts"
import {
  applyOperation,
  getBlock,
  type BlockTree,
} from "@reason/core/engine/tree"
import { isDescendantOf } from "@/lib/editor/tree-view"

export interface SelectionRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function orderedSelection(ids: Iterable<string>, visibleIds: string[]) {
  const positions = new Map(visibleIds.map((id, index) => [id, index]))
  return [...new Set(ids)].sort(
    (left, right) =>
      (positions.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right) ?? Number.MAX_SAFE_INTEGER)
  )
}

export function normalizeSelectedRoots(
  tree: BlockTree,
  ids: Iterable<string>,
  visibleIds: string[]
) {
  const selected = new Set(ids)
  return orderedSelection(selected, visibleIds).filter((id) => {
    const block = tree.blocks.get(id)
    if (!block?.parentId || block.trashedAt) return false
    let parentId: string | null = block.parentId
    while (parentId) {
      if (selected.has(parentId)) return false
      parentId = tree.blocks.get(parentId)?.parentId ?? null
    }
    return true
  })
}

export function rangeSelection(
  visibleIds: string[],
  anchorId: string,
  targetId: string
) {
  const anchor = visibleIds.indexOf(anchorId)
  const target = visibleIds.indexOf(targetId)
  if (anchor === -1 || target === -1) return []
  return visibleIds.slice(
    Math.min(anchor, target),
    Math.max(anchor, target) + 1
  )
}

export function intersectsSelectionRect(
  selection: SelectionRect,
  block: SelectionRect
) {
  return (
    selection.right > block.left &&
    selection.left < block.right &&
    selection.bottom > block.top &&
    selection.top < block.bottom
  )
}

export function hasNativeTextSelection(container: HTMLElement | null) {
  const selection = window.getSelection()
  if (
    !container ||
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount === 0
  )
    return false
  const range = selection.getRangeAt(0)
  return (
    container.contains(range.startContainer) &&
    container.contains(range.endContainer)
  )
}

export function planMultiBlockMove(
  tree: BlockTree,
  selectedIds: Iterable<string>,
  visibleIds: string[],
  targetId: string,
  position: "above" | "below",
  createOperationId: () => string
): Operation[] {
  const roots = normalizeSelectedRoots(tree, selectedIds, visibleIds)
  if (roots.length === 0 || roots.includes(targetId)) return []
  if (roots.some((root) => isDescendantOf(tree, targetId, root))) return []

  const target = getBlock(tree, targetId)
  if (!target.parentId) return []
  const processing = position === "above" ? roots : [...roots].reverse()
  let working = tree
  const operations: Operation[] = []

  for (const blockId of processing) {
    const block = getBlock(working, blockId)
    const currentTarget = getBlock(working, targetId)
    if (!block.parentId || !currentTarget.parentId) return []
    const targetParent = getBlock(working, currentTarget.parentId)
    const targetIndex = targetParent.content.indexOf(targetId)
    const rootIndex =
      block.parentId === targetParent.id
        ? targetParent.content.indexOf(blockId)
        : -1
    const targetAfterRemoval =
      rootIndex !== -1 && rootIndex < targetIndex
        ? targetIndex - 1
        : targetIndex
    const operation: Operation = {
      type: "move_block",
      opId: createOperationId(),
      blockId,
      newParentId: targetParent.id,
      index: targetAfterRemoval + (position === "below" ? 1 : 0),
    }
    working = applyOperation(working, operation).tree
    operations.push(operation)
  }
  return operations
}
