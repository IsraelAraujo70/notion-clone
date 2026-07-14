import { FileTextIcon, ListRestartIcon, WandSparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AiAction } from "@/lib/ai/contracts"

export function AiActionControls({
  canWrite,
  pageId,
  pageBlockIds,
  selectedBlockIds,
  onAction,
}: {
  canWrite: boolean
  pageId: string
  pageBlockIds: string[]
  selectedBlockIds: string[]
  onAction: (action: AiAction, prompt: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Ações de AI">
      <Button
        size="xs"
        variant="outline"
        disabled={!canWrite}
        onClick={() =>
          onAction(
            { type: "summarize_page", page_id: pageId },
            "Summarize this page"
          )
        }
      >
        <FileTextIcon /> Resumir
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!canWrite || selectedBlockIds.length === 0}
        onClick={() =>
          onAction(
            {
              type: "transform_selection",
              block_ids: selectedBlockIds,
              instruction: "Improve clarity and formatting",
            },
            "Improve clarity and formatting"
          )
        }
      >
        <WandSparklesIcon /> Formatar seleção
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={!canWrite || pageBlockIds.length === 0}
        onClick={() =>
          onAction(
            {
              type: "transform_selection",
              block_ids: pageBlockIds,
              instruction: "Improve the page structure and formatting",
            },
            "Improve the page structure and formatting"
          )
        }
      >
        <ListRestartIcon /> Formatar página
      </Button>
    </div>
  )
}
