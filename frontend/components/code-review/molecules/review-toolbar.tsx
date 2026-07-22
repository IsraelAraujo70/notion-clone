import { Columns2Icon, Rows3Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

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
  const name = filePath.split("/").at(-1) ?? filePath
  const directory = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : null

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2" title={filePath}>
          <h2 className="shrink-0 font-mono text-sm font-semibold">{name}</h2>
          {directory ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {directory}
            </span>
          ) : null}
        </div>
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
        <ToggleGroup
          type="single"
          value={viewMode}
          size="sm"
          variant="outline"
          spacing={0}
          aria-label="Diff layout"
          onValueChange={(value) => {
            if (value === "unified" || value === "split") {
              onViewModeChange(value)
            }
          }}
        >
          <ToggleGroupItem value="unified" aria-label="Unified">
            <Rows3Icon data-icon="inline-start" />
            Unified
          </ToggleGroupItem>
          <ToggleGroupItem
            value="split"
            aria-label="Split"
            className="hidden md:inline-flex"
          >
            <Columns2Icon data-icon="inline-start" />
            Split
          </ToggleGroupItem>
        </ToggleGroup>

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
