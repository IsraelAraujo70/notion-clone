import { FileTextIcon, ListRestartIcon, WandSparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AiAction } from "@/lib/ai/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"

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
  const { t } = useI18n()

  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t("AI actions")}>
      <Button
        size="xs"
        variant="outline"
        disabled={!canWrite}
        onClick={() =>
          onAction(
            { type: "summarize_page", page_id: pageId },
            t("Summarize this page")
          )
        }
      >
        <FileTextIcon /> {t("Summarize")}
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
              instruction: t("Improve clarity and formatting"),
            },
            t("Improve clarity and formatting")
          )
        }
      >
        <WandSparklesIcon /> {t("Format selection")}
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
              instruction: t("Improve the page structure and formatting"),
            },
            t("Improve the page structure and formatting")
          )
        }
      >
        <ListRestartIcon /> {t("Format page")}
      </Button>
    </div>
  )
}
