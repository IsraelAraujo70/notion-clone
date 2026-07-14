import { ExternalLinkIcon } from "lucide-react"

import type { AiCitation as Citation } from "@/lib/ai/contracts"

export function AiCitation({
  citation,
  onOpen,
}: {
  citation: Citation
  onOpen: (citation: Citation) => void
}) {
  return (
    <button
      type="button"
      className="flex w-full gap-2 rounded-lg border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onOpen(citation)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {citation.page_title}
        </span>
        <span className="mt-0.5 line-clamp-2 text-muted-foreground">
          {citation.snippet}
        </span>
      </span>
      <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}
