export const INLINE_MARKS = ["bold", "italic", "strike", "code"] as const

export type InlineMark = (typeof INLINE_MARKS)[number]

export interface InlineSegment {
  text: string
  marks: InlineMark[]
}

interface Frame {
  marker: string
  mark: InlineMark | null
  segments: InlineSegment[]
}

const MARK_ORDER = new Map(INLINE_MARKS.map((mark, index) => [mark, index]))

function sameMarks(left: InlineMark[], right: InlineMark[]) {
  return (
    left.length === right.length &&
    left.every((mark, index) => mark === right[index])
  )
}

function append(
  segments: InlineSegment[],
  text: string,
  marks: InlineMark[] = [],
) {
  if (!text) return
  const orderedMarks = [...new Set(marks)].sort(
    (left, right) => MARK_ORDER.get(left)! - MARK_ORDER.get(right)!,
  )
  segments.push({ text, marks: orderedMarks })
}

function compact(segments: InlineSegment[]) {
  const result: InlineSegment[] = []
  let parts: string[] = []
  let marks: InlineMark[] = []
  const flush = () => {
    if (parts.length > 0) result.push({ text: parts.join(""), marks })
    parts = []
  }
  for (const segment of segments) {
    if (parts.length > 0 && !sameMarks(marks, segment.marks)) flush()
    if (parts.length === 0) marks = segment.marks
    parts.push(segment.text)
  }
  flush()
  return result
}

function appendSegments(target: InlineSegment[], source: InlineSegment[]) {
  for (const segment of source) append(target, segment.text, segment.marks)
}

function marked(segments: InlineSegment[], mark: InlineMark) {
  return segments.map((segment) => ({
    text: segment.text,
    marks: [...segment.marks, mark],
  }))
}

function markerAt(source: string, index: number) {
  if (source.startsWith("**", index))
    return { marker: "**", mark: "bold" as const }
  if (source.startsWith("~~", index))
    return { marker: "~~", mark: "strike" as const }
  if (source[index] === "*") return { marker: "*", mark: "italic" as const }
  if (source[index] === "~") return { marker: "~", mark: "strike" as const }
  return null
}

function backtickRun(source: string, index: number) {
  let end = index
  while (source[end] === "`") end += 1
  return end - index
}

function closingBacktick(source: string, start: number) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1
      continue
    }
    if (source[index] === "`" && backtickRun(source, index) === 1) return index
  }
  return -1
}

/** Parses the supported inline Markdown subset without producing HTML. */
export function parseInlineMarkdown(source: string): InlineSegment[] {
  const root: Frame = { marker: "", mark: null, segments: [] }
  const stack = [root]
  const current = () => stack[stack.length - 1]

  for (let index = 0; index < source.length;) {
    if (source[index] === "\\" && index + 1 < source.length) {
      const escaped = source[index + 1]
      const escapedMarker = markerAt(source, index + 1)
      if (escapedMarker) {
        append(current().segments, escapedMarker.marker)
        index += escapedMarker.marker.length + 1
        continue
      }
      if (escaped === "\\" || escaped === "`") {
        append(current().segments, escaped)
        index += 2
        continue
      }
    }

    if (source[index] === "`") {
      const run = backtickRun(source, index)
      if (run !== 1) {
        append(current().segments, source.slice(index, index + run))
        index += run
        continue
      }
      const close = closingBacktick(source, index + 1)
      if (close > index + 1) {
        append(current().segments, source.slice(index + 1, close), ["code"])
        index = close + 1
        continue
      }
      append(current().segments, close === index + 1 ? "``" : "`")
      index = close === index + 1 ? close + 1 : index + 1
      continue
    }

    const openFrame = current()
    const token =
      openFrame.mark && source.startsWith(openFrame.marker, index)
        ? { marker: openFrame.marker, mark: openFrame.mark }
        : markerAt(source, index)
    if (!token) {
      let end = index + 1
      while (end < source.length && !"\\`*~".includes(source[end])) end += 1
      append(current().segments, source.slice(index, end))
      index = end
      continue
    }

    const frame = current()
    if (frame.marker !== token.marker) {
      stack.push({ marker: token.marker, mark: token.mark, segments: [] })
      index += token.marker.length
      continue
    }

    stack.pop()
    if (frame.segments.length === 0) {
      append(current().segments, token.marker + token.marker)
    } else {
      appendSegments(current().segments, marked(frame.segments, token.mark))
    }
    index += token.marker.length
  }

  while (stack.length > 1) {
    const frame = stack.pop()!
    append(current().segments, frame.marker)
    appendSegments(current().segments, frame.segments)
  }

  return compact(root.segments)
}

export function hasInlineMarkdown(segments: InlineSegment[]) {
  return segments.some((segment) => segment.marks.length > 0)
}
