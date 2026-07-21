import type { ReviewLineAddress } from "./contracts"

export interface LineSelection {
  anchor: ReviewLineAddress
  focus: ReviewLineAddress
}

export interface ReviewLineRange {
  path: string
  side: ReviewLineAddress["side"]
  startLine: number
  endLine: number
}

export function updateLineSelection(
  selection: LineSelection | null,
  address: ReviewLineAddress,
  extend: boolean
): LineSelection {
  if (
    !extend ||
    !selection ||
    selection.anchor.path !== address.path ||
    selection.anchor.hunkId !== address.hunkId ||
    selection.anchor.side !== address.side
  ) {
    return { anchor: address, focus: address }
  }

  return { anchor: selection.anchor, focus: address }
}

export function toReviewLineRange(selection: LineSelection): ReviewLineRange {
  return {
    path: selection.anchor.path,
    side: selection.anchor.side,
    startLine: Math.min(selection.anchor.line, selection.focus.line),
    endLine: Math.max(selection.anchor.line, selection.focus.line),
  }
}

export function selectionContains(
  selection: LineSelection | null,
  address: ReviewLineAddress
): boolean {
  if (!selection) return false
  const range = toReviewLineRange(selection)
  return (
    range.path === address.path &&
    selection.anchor.hunkId === address.hunkId &&
    selection.focus.hunkId === address.hunkId &&
    range.side === address.side &&
    address.line >= range.startLine &&
    address.line <= range.endLine
  )
}
