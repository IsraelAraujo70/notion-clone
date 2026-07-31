import { FileTextIcon, VideoIcon } from "lucide-react"

import type { CalendarProjectionEvent } from "@/lib/api"

export function CalendarEventCard({
  event,
  compact = false,
  onClick,
}: {
  event: CalendarProjectionEvent
  compact?: boolean
  onClick: () => void
}) {
  const isGoogle = event.origin !== "manual"
  return (
    <button
      type="button"
      title={event.title}
      aria-label={event.title}
      data-origin={event.origin}
      className={`group flex w-full min-w-0 items-center gap-1.5 rounded text-left ring-primary outline-none focus-visible:ring-2 ${
        compact ? "h-6 px-1.5 text-[11px]" : "min-h-8 px-2 py-1 text-xs"
      } ${
        event.status === "cancelled"
          ? "bg-muted text-muted-foreground line-through"
          : isGoogle
            ? "bg-blue-500/10 text-blue-800 hover:bg-blue-500/15 dark:text-blue-200"
            : "bg-muted text-foreground hover:bg-muted/80"
      }`}
      style={{
        borderLeft: `3px solid ${event.color ?? (isGoogle ? "#2563eb" : "#64748b")}`,
      }}
      onClick={onClick}
    >
      {event.origin === "materialized" ? (
        <FileTextIcon className="size-3 shrink-0" aria-label="Com notas" />
      ) : event.meet_url ? (
        <VideoIcon className="size-3 shrink-0" aria-label="Google Meet" />
      ) : null}
      {!event.all_day && compact ? (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {formatTime(event.start)}
        </span>
      ) : null}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : ""
}
