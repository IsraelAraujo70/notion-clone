"use client"

import type { DatabaseCalendarMode } from "@reason/core/database"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CalendarEventCard } from "../molecules/calendar-event-card"
import { CalendarEventPopover } from "../molecules/calendar-event-popover"
import { CalendarMonthGrid } from "../molecules/calendar-month-grid"
import { CalendarToolbar } from "../molecules/calendar-toolbar"
import { CalendarWeekGrid, startOfWeek } from "../molecules/calendar-week-grid"
import { GoogleCalendarSettingsPanel } from "@/components/google-calendar/organisms/google-calendar-settings-panel"
import { useGoogleCalendarEvents } from "@/components/google-calendar/hooks/use-google-calendar-events"
import type { CalendarProjectionEvent } from "@/lib/api"

export function DatabaseCalendar({
  databaseId,
  token,
  workspaceId,
  defaultMode,
  readOnly,
  onOpenRow,
  onAddNotes,
}: {
  databaseId: string
  token?: string | null
  workspaceId?: string
  defaultMode: DatabaseCalendarMode
  readOnly: boolean
  onOpenRow?: (rowId: string) => void
  onAddNotes?: (event: CalendarProjectionEvent) => Promise<string>
}) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [mode, setMode] = useState<DatabaseCalendarMode>(defaultMode)
  const [selected, setSelected] = useState<CalendarProjectionEvent | null>(null)
  const [materializing, setMaterializing] = useState(false)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const range = useMemo(
    () => visibleRange(anchor, mode, timezone),
    [anchor, mode, timezone]
  )
  const { events, loading, error, refresh } = useGoogleCalendarEvents({
    token,
    workspaceId,
    databaseId,
    range,
    enabled: Boolean(token && workspaceId),
  })
  const today = localDateKey(new Date())
  const label = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(anchor)

  const move = (direction: -1 | 1) => {
    setAnchor((current) => {
      const next = new Date(current)
      if (mode === "month") {
        next.setDate(1)
        next.setMonth(current.getMonth() + direction)
      } else next.setDate(current.getDate() + direction * 7)
      return next
    })
  }

  return (
    <div
      className="relative min-w-full bg-background"
      data-cy="database-calendar"
    >
      <CalendarToolbar
        label={label}
        mode={mode}
        onModeChange={setMode}
        onToday={() => setAnchor(new Date())}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        settings={
          token && workspaceId && !readOnly ? (
            <GoogleCalendarSettingsPanel
              token={token}
              workspaceId={workspaceId}
              databaseId={databaseId}
              onSourcesChanged={refresh}
            />
          ) : undefined
        }
      />
      {loading ? (
        <div className="absolute top-14 right-3 z-20 inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <Loader2Icon className="size-3.5 animate-spin" /> Sincronizando
        </div>
      ) : null}
      {error ? (
        <button
          type="button"
          className="m-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          onClick={refresh}
        >
          <RefreshCwIcon className="size-3.5" /> Não foi possível carregar.
          Tentar novamente
        </button>
      ) : null}
      {mode === "month" ? (
        <CalendarMonthGrid
          anchor={anchor}
          events={events}
          today={today}
          onSelect={setSelected}
        />
      ) : (
        <CalendarWeekGrid
          anchor={anchor}
          events={events}
          today={today}
          onSelect={setSelected}
        />
      )}
      <MobileAgenda events={events} onSelect={setSelected} />
      {selected ? (
        <CalendarEventPopover
          event={selected}
          canWrite={!readOnly && Boolean(onAddNotes)}
          materializing={materializing}
          onClose={() => setSelected(null)}
          onOpenNotes={(rowId) => onOpenRow?.(rowId)}
          onAddNotes={async (event) => {
            if (!onAddNotes) return
            setMaterializing(true)
            try {
              const rowId = await onAddNotes(event)
              setSelected({
                ...event,
                origin: "materialized",
                row_id: rowId,
                private: false,
              })
              refresh()
              onOpenRow?.(rowId)
            } catch {
              toast.error("Não foi possível criar as notas")
            } finally {
              setMaterializing(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function MobileAgenda({
  events,
  onSelect,
}: {
  events: CalendarProjectionEvent[]
  onSelect: (event: CalendarProjectionEvent) => void
}) {
  const groups = events.reduce<Map<string, CalendarProjectionEvent[]>>(
    (result, event) => {
      const key = event.all_day
        ? event.start
        : localDateKey(new Date(event.start))
      result.set(key, [...(result.get(key) ?? []), event])
      return result
    },
    new Map()
  )
  return (
    <div className="divide-y sm:hidden">
      {[...groups].map(([date, items]) => (
        <section
          key={date}
          className="grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-3"
        >
          <h4 className="text-xs font-semibold text-muted-foreground capitalize">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(new Date(`${date}T12:00:00`))}
          </h4>
          <div className="space-y-1.5">
            {items.map((event) => (
              <CalendarEventCard
                key={event.id}
                event={event}
                onClick={() => onSelect(event)}
              />
            ))}
          </div>
        </section>
      ))}
      {events.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhum evento neste período.
        </p>
      ) : null}
    </div>
  )
}

function visibleRange(
  anchor: Date,
  mode: DatabaseCalendarMode,
  timezone: string
) {
  const start =
    mode === "week"
      ? startOfWeek(anchor)
      : new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  if (mode === "month") start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + (mode === "month" ? 42 : 7))
  return { start: start.toISOString(), end: end.toISOString(), timezone }
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
