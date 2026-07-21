import { SparklesIcon } from "lucide-react"

import { useI18n } from "@/lib/i18n/i18n-provider"

type Props = {
  onPick: (prompt: string) => void
}

export function AiEmptyState({ onPick }: Props) {
  const { t } = useI18n()
  const suggestions: { label: string; prompt: string }[] = [
    { label: t("Summarize a page"), prompt: t("Summarize @") },
    { label: t("Find in the workspace"), prompt: t("Find pages about ") },
    { label: t("Start a draft"), prompt: t("Draft ") },
  ]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="grid size-11 place-items-center rounded-2xl border border-manila/40 bg-manila/15">
        <SparklesIcon className="size-5 text-manila-strong" />
      </div>
      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {t("What should we work on?")}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {t(
            "Ask anything about this workspace. Type @ to focus the answer on a page."
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className="rounded-full border border-border bg-background px-3.5 py-1.5 text-[13px] text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onPick(suggestion.prompt)}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  )
}
