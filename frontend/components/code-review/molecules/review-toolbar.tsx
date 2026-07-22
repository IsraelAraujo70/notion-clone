import { Columns2Icon, Rows3Icon } from "lucide-react"

import { Button } from "@/components/ui/button"

export type DiffViewMode = "unified" | "split"

interface ReviewToolbarProps {
  filePath: string
  additions: number
  deletions: number
  viewMode: DiffViewMode
  onViewModeChange: (mode: DiffViewMode) => void
  onPreviousFile?: () => void
  onNextFile?: () => void
  hasPreviousFile?: boolean
  hasNextFile?: boolean
}

export function ReviewToolbar({
  filePath,
  additions,
  deletions,
  viewMode,
  onViewModeChange,
  onPreviousFile,
  onNextFile,
  hasPreviousFile = false,
  hasNextFile = false,
}: ReviewToolbarProps) {
  return (
    <header className="flex flex-col gap-3 border-b bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2
          className="truncate font-mono text-sm font-semibold"
          title={filePath}
        >
          {filePath}
        </h2>
        <p
          className="text-xs"
          aria-label={`${additions} additions, ${deletions} deletions`}
        >
          <span className="text-emerald-700 dark:text-emerald-400">
            +{additions}
          </span>{" "}
          <span className="text-red-700 dark:text-red-400">-{deletions}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border bg-background p-0.5"
          role="group"
          aria-label="Diff layout"
        >
          <Button
            type="button"
            size="sm"
            variant={viewMode === "unified" ? "secondary" : "ghost"}
            aria-pressed={viewMode === "unified"}
            onClick={() => onViewModeChange("unified")}
          >
            <Rows3Icon aria-hidden="true" />
            Unified
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "split" ? "secondary" : "ghost"}
            aria-pressed={viewMode === "split"}
            className="hidden md:inline-flex"
            onClick={() => onViewModeChange("split")}
          >
            <Columns2Icon aria-hidden="true" />
            Split
          </Button>
        </div>

        {(onPreviousFile || onNextFile) && (
          <div className="inline-flex gap-1" aria-label="File navigation">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasPreviousFile}
              onClick={onPreviousFile}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasNextFile}
              onClick={onNextFile}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
