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
  const startTime = event.all_day
    ? null
    : formatTime(event.start, event.time_zone)
  return (
    <button
      type="button"
      title={startTime ? `${startTime} ${event.title}` : event.title}
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
      {startTime ? (
        <time
          dateTime={event.start}
          className="shrink-0 text-[0.9em] font-semibold text-current/70 tabular-nums"
        >
          {startTime}
        </time>
      ) : null}
      {event.origin === "materialized" ? (
        <FileTextIcon className="size-3 shrink-0" aria-label="Com notas" />
      ) : event.meet_url ? (
        <VideoIcon className="size-3 shrink-0" aria-label="Google Meet" />
      ) : null}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

function formatTime(value: string, timeZone: string | null) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null

  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }
  try {
    return new Intl.DateTimeFormat("pt-BR", options).format(date)
  } catch {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date)
  }
}
