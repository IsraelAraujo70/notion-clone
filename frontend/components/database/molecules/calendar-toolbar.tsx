import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import type { DatabaseCalendarMode } from "@reason/core/database"

export function CalendarToolbar({
  label,
  mode,
  onModeChange,
  onToday,
  onPrevious,
  onNext,
  settings,
}: {
  label: string
  mode: DatabaseCalendarMode
  onModeChange: (mode: DatabaseCalendarMode) => void
  onToday: () => void
  onPrevious: () => void
  onNext: () => void
  settings?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
      <button
        type="button"
        className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted"
        onClick={onToday}
      >
        Hoje
      </button>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Período anterior"
          className="grid size-8 place-items-center rounded-md hover:bg-muted"
          onClick={onPrevious}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Próximo período"
          className="grid size-8 place-items-center rounded-md hover:bg-muted"
          onClick={onNext}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <h3 className="min-w-36 flex-1 text-sm font-semibold capitalize sm:text-base">
        {label}
      </h3>
      <div className="hidden rounded-md border bg-muted/30 p-0.5 sm:inline-flex">
        {(["month", "week"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded px-2.5 py-1 text-xs ${
              mode === value
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground"
            }`}
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
          >
            {value === "month" ? "Mês" : "Semana"}
          </button>
        ))}
      </div>
      {settings}
    </div>
  )
}
