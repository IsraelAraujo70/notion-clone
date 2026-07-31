import {
  CalendarClockIcon,
  ExternalLinkIcon,
  FilePlus2Icon,
  MapPinIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import type { CalendarProjectionEvent } from "@/lib/api"

export function CalendarEventPopover({
  event,
  canWrite,
  materializing,
  onClose,
  onOpenNotes,
  onAddNotes,
}: {
  event: CalendarProjectionEvent
  canWrite: boolean
  materializing: boolean
  onClose: () => void
  onOpenNotes: (rowId: string) => void
  onAddNotes: (event: CalendarProjectionEvent) => void
}) {
  return (
    <div
      role="dialog"
      aria-label={event.title}
      className="absolute inset-x-3 top-14 z-40 max-w-sm rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl sm:right-4 sm:left-auto"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute top-2 right-2 rounded p-1 hover:bg-muted"
        onClick={onClose}
      >
        <XIcon className="size-4" />
      </button>
      <div className="pr-7">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {event.origin === "manual"
            ? "Linha da database"
            : event.private
              ? "Evento privado"
              : "Reunião com notas"}
        </p>
        <h4 className="mt-1 text-base leading-snug font-semibold">
          {event.title}
        </h4>
      </div>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          {formatRange(event)}
        </p>
        {event.location ? (
          <p className="flex items-center gap-2">
            <MapPinIcon className="size-4" />
            {event.location}
          </p>
        ) : null}
        {event.status === "cancelled" ? (
          <p className="rounded-md bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
            O evento foi cancelado. As notas continuam disponíveis.
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {event.row_id ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            onClick={() => onOpenNotes(event.row_id!)}
          >
            <FilePlus2Icon className="size-4" />
            Abrir notas
          </button>
        ) : event.origin === "google" && canWrite ? (
          <button
            type="button"
            disabled={materializing}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            onClick={() => onAddNotes(event)}
          >
            <FilePlus2Icon className="size-4" />
            {materializing ? "Criando…" : "Adicionar notas"}
          </button>
        ) : null}
        {event.meet_url ? (
          <a
            href={event.meet_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <VideoIcon className="size-4" /> Meet
          </a>
        ) : null}
        {event.google_url ? (
          <a
            href={event.google_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir no Google Calendar"
            className="grid size-9 place-items-center rounded-md border hover:bg-muted"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

function formatRange(event: CalendarProjectionEvent) {
  if (event.all_day) return `${event.start} · dia inteiro`
  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  return `${format.format(new Date(event.start))} – ${format.format(new Date(event.end))}`
}
