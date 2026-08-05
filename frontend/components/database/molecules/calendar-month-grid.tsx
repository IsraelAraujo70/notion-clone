import { calendarMonthDays } from "@reason/core/database"

import type { CalendarProjectionEvent } from "@/lib/api"
import { CalendarEventCard } from "./calendar-event-card"

const WEEKDAYS = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."]

export function CalendarMonthGrid({
  anchor,
  events,
  today,
  onSelect,
}: {
  anchor: Date
  events: CalendarProjectionEvent[]
  today: string
  onSelect: (event: CalendarProjectionEvent) => void
}) {
  const days = calendarMonthDays(anchor.getFullYear(), anchor.getMonth() + 1)
  return (
    <div className="hidden min-w-[760px] grid-cols-7 sm:grid">
      {WEEKDAYS.map((day) => (
        <div
          key={day}
          className="border-r border-b px-2 py-1.5 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase last:border-r-0"
        >
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = events.filter((event) =>
          eventDayKeys(event).includes(day.date)
        )
        return (
          <div
            key={day.date}
            data-date={day.date}
            className={`min-h-28 border-r border-b p-1 last:border-r-0 ${
              day.inMonth
                ? "bg-background"
                : "bg-muted/20 text-muted-foreground"
            }`}
          >
            <span
              className={`mb-1 grid size-6 place-items-center rounded-full text-xs tabular-nums ${
                day.date === today ? "bg-blue-600 font-semibold text-white" : ""
              }`}
            >
              {Number(day.date.slice(-2))}
            </span>
            <div className="space-y-1">
              {dayEvents.slice(0, 4).map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  compact
                  onClick={() => onSelect(event)}
                />
              ))}
              {dayEvents.length > 4 ? (
                <span className="block px-1 text-[10px] text-muted-foreground">
                  +{dayEvents.length - 4} eventos
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function eventDayKeys(event: CalendarProjectionEvent) {
  if (event.all_day) return enumerateDates(event.start, event.end)
  const start = localDateKey(new Date(event.start))
  const end = localDateKey(new Date(new Date(event.end).getTime() - 1))
  return enumerateDates(start, addDay(end))
}

function enumerateDates(start: string, endExclusive: string) {
  const result: string[] = []
  for (
    let value = start;
    value < endExclusive && result.length < 370;
    value = addDay(value)
  ) {
    result.push(value)
  }
  return result
}

function addDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
