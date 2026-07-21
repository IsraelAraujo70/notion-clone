import type { ReviewLineAddress } from "./contracts"
import type {
  ParsedPatch,
  ParsedPatchHunk,
  ParsedPatchLine,
  PatchLineKind,
} from "./parse-unified-patch"

export interface DiffCodeCell {
  kind: PatchLineKind
  content: string
  line: number
  address: ReviewLineAddress
  noNewline: boolean
}

export type UnifiedDiffRow =
  | { type: "hunk"; id: string; header: string }
  | { type: "notice"; id: string; state: DiffNoticeState }
  | {
      type: "code"
      id: string
      kind: PatchLineKind
      content: string
      oldLine: number | null
      newLine: number | null
      leftAddress: ReviewLineAddress | null
      rightAddress: ReviewLineAddress | null
      noNewline: boolean
    }

export type SplitDiffRow =
  | { type: "hunk"; id: string; header: string }
  | { type: "notice"; id: string; state: DiffNoticeState }
  | {
      type: "code"
      id: string
      left: DiffCodeCell | null
      right: DiffCodeCell | null
    }

export function toUnifiedRows(
  path: string,
  patch: ParsedPatch
): UnifiedDiffRow[] {
  if (patch.kind !== "text") {
    return [noticeRow(patch.kind === "invalid" ? patch.reason : patch.kind)]
  }

  return patch.hunks.flatMap((hunk, hunkIndex) => [
    {
      type: "hunk" as const,
      id: hunk.id,
      header: hunk.header,
    },
    ...hunk.lines.map((line, lineIndex) => ({
      type: "code" as const,
      id: `line-${hunkIndex}-${lineIndex}`,
      kind: line.kind,
      content: line.content,
      oldLine: line.oldLine,
      newLine: line.newLine,
      leftAddress:
        line.oldLine === null
          ? null
          : {
              path,
              hunkId: hunk.id,
              side: "LEFT" as const,
              line: line.oldLine,
            },
      rightAddress:
        line.newLine === null
          ? null
          : {
              path,
              hunkId: hunk.id,
              side: "RIGHT" as const,
              line: line.newLine,
            },
      noNewline: line.noNewline,
    })),
  ])
}

export function toSplitRows(path: string, patch: ParsedPatch): SplitDiffRow[] {
  if (patch.kind !== "text") {
    return [noticeRow(patch.kind === "invalid" ? patch.reason : patch.kind)]
  }

  return patch.hunks.flatMap((hunk, hunkIndex) =>
    splitHunk(path, hunk, hunkIndex)
  )
}

function splitHunk(
  path: string,
  hunk: ParsedPatchHunk,
  hunkIndex: number
): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [
    { type: "hunk", id: hunk.id, header: hunk.header },
  ]
  let deletions: ParsedPatchLine[] = []
  let additions: ParsedPatchLine[] = []
  let blockIndex = 0

  const flushChanges = () => {
    const length = Math.max(deletions.length, additions.length)
    for (let index = 0; index < length; index += 1) {
      rows.push({
        type: "code",
        id: `change-${hunkIndex}-${blockIndex}-${index}`,
        left: toCell(path, hunk.id, deletions[index] ?? null, "LEFT"),
        right: toCell(path, hunk.id, additions[index] ?? null, "RIGHT"),
      })
    }
    if (length > 0) blockIndex += 1
    deletions = []
    additions = []
  }

  hunk.lines.forEach((line, lineIndex) => {
    if (line.kind === "deletion") {
      deletions.push(line)
      return
    }
    if (line.kind === "addition") {
      additions.push(line)
      return
    }

    flushChanges()
    rows.push({
      type: "code",
      id: `context-${hunkIndex}-${lineIndex}`,
      left: toCell(path, hunk.id, line, "LEFT"),
      right: toCell(path, hunk.id, line, "RIGHT"),
    })
  })
  flushChanges()

  return rows
}

function toCell(
  path: string,
  hunkId: string,
  line: ParsedPatchLine | null,
  side: "LEFT" | "RIGHT"
): DiffCodeCell | null {
  const number = side === "LEFT" ? line?.oldLine : line?.newLine
  if (!line || number === null || number === undefined) return null
  return {
    kind: line.kind,
    content: line.content,
    line: number,
    address: { path, hunkId, side, line: number },
    noNewline: line.noNewline,
  }
}

export type DiffNoticeState = "binary" | "missing" | "malformed" | "truncated"

function noticeRow(state: DiffNoticeState) {
  return { type: "notice" as const, id: `notice-${state}`, state }
}
