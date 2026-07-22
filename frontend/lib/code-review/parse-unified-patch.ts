export type PatchLineKind = "context" | "addition" | "deletion"

export interface ParsedPatchLine {
  kind: PatchLineKind
  content: string
  oldLine: number | null
  newLine: number | null
  noNewline: boolean
}

export interface ParsedPatchHunk {
  id: string
  header: string
  heading: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: ParsedPatchLine[]
}

export type ParsedPatch =
  | {
      kind: "text"
      headers: string[]
      hunks: ParsedPatchHunk[]
    }
  | { kind: "binary" }
  | { kind: "missing" }
  | { kind: "invalid"; reason: "malformed" | "truncated" }

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s?(.*))?$/
const PATCH_HEADER =
  /^(?:diff --git |index |--- |\+\+\+ |old mode |new mode |deleted file mode |new file mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to )/

export function parseUnifiedPatch(
  patch: string | null | undefined,
  options: { isBinary?: boolean } = {}
): ParsedPatch {
  if (options.isBinary) return { kind: "binary" }
  if (!patch?.trim()) return { kind: "missing" }
  if (/^(?:Binary files .* differ|GIT binary patch)$/m.test(patch)) {
    return { kind: "binary" }
  }

  const sourceLines = patch.replaceAll("\r\n", "\n").split("\n")
  const headers: string[] = []
  const hunks: ParsedPatchHunk[] = []
  let current: ParsedPatchHunk | null = null
  let oldLine = 0
  let newLine = 0
  let consumedOld = 0
  let consumedNew = 0

  const isComplete = () =>
    !!current &&
    consumedOld === current.oldLines &&
    consumedNew === current.newLines

  for (let index = 0; index < sourceLines.length; index += 1) {
    const source = sourceLines[index]!
    const match = source.match(HUNK_HEADER)

    if (match) {
      if (current && !isComplete()) {
        return { kind: "invalid", reason: "malformed" }
      }

      const oldStart = Number(match[1])
      const oldLines = match[2] === undefined ? 1 : Number(match[2])
      const newStart = Number(match[3])
      const newLines = match[4] === undefined ? 1 : Number(match[4])
      if (
        ![oldStart, oldLines, newStart, newLines].every(Number.isSafeInteger) ||
        (oldLines > 0 && oldStart === 0) ||
        (newLines > 0 && newStart === 0)
      ) {
        return { kind: "invalid", reason: "malformed" }
      }

      oldLine = oldStart
      newLine = newStart
      consumedOld = 0
      consumedNew = 0
      current = {
        id: `hunk-${hunks.length}`,
        header: source,
        heading: match[5] ?? "",
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      }
      hunks.push(current)
      continue
    }

    if (!current) {
      if (!source && index === sourceLines.length - 1) continue
      if (!PATCH_HEADER.test(source)) {
        return { kind: "invalid", reason: "malformed" }
      }
      headers.push(source)
      continue
    }

    if (source === "\\ No newline at end of file") {
      const previous = current.lines.at(-1)
      if (!previous || previous.noNewline) {
        return { kind: "invalid", reason: "malformed" }
      }
      previous.noNewline = true
      continue
    }

    if (source === "" && index === sourceLines.length - 1) continue

    if (isComplete()) {
      return { kind: "invalid", reason: "malformed" }
    }

    if (source.startsWith("+")) {
      if (consumedNew >= current.newLines) {
        return { kind: "invalid", reason: "malformed" }
      }
      current.lines.push({
        kind: "addition",
        content: source.slice(1),
        oldLine: null,
        newLine,
        noNewline: false,
      })
      newLine += 1
      consumedNew += 1
      continue
    }

    if (source.startsWith("-")) {
      if (consumedOld >= current.oldLines) {
        return { kind: "invalid", reason: "malformed" }
      }
      current.lines.push({
        kind: "deletion",
        content: source.slice(1),
        oldLine,
        newLine: null,
        noNewline: false,
      })
      oldLine += 1
      consumedOld += 1
      continue
    }

    if (!source.startsWith(" ")) {
      return { kind: "invalid", reason: "malformed" }
    }
    if (consumedOld >= current.oldLines || consumedNew >= current.newLines) {
      return { kind: "invalid", reason: "malformed" }
    }
    current.lines.push({
      kind: "context",
      content: source.slice(1),
      oldLine,
      newLine,
      noNewline: false,
    })
    oldLine += 1
    newLine += 1
    consumedOld += 1
    consumedNew += 1
  }

  if (current && !isComplete()) {
    return { kind: "invalid", reason: "truncated" }
  }

  return { kind: "text", headers, hunks }
}
