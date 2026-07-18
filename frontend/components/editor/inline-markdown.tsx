import type { InlineSegment } from "@reason/core/inline-markdown"
import type { ReactNode } from "react"

export function InlineMarkdown({
  segments,
  dataCy,
}: {
  segments: InlineSegment[]
  dataCy?: string
}) {
  return (
    <span data-cy={dataCy}>
      {segments.map((segment, index) => {
        let content: ReactNode = segment.text
        if (segment.marks.includes("code")) {
          content = (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
              {content}
            </code>
          )
        }
        if (segment.marks.includes("bold")) content = <strong>{content}</strong>
        if (segment.marks.includes("italic")) content = <em>{content}</em>
        if (segment.marks.includes("strike")) content = <del>{content}</del>
        return <span key={`${index}-${segment.text}`}>{content}</span>
      })}
    </span>
  )
}
