import type { CalendarProjectionEvent } from "@/lib/api"
import { CalendarEventCard } from "./calendar-event-card"
import { eventDayKeys } from "./calendar-month-grid"

export function CalendarWeekGrid({
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
  const start = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start)
    value.setDate(start.getDate() + index)
    return value
  })
  return (
    <div className="hidden min-w-[760px] grid-cols-7 sm:grid">
      {days.map((day) => {
        const key = localDateKey(day)
        const dayEvents = events.filter((event) =>
          eventDayKeys(event).includes(key)
        )
        const allDay = dayEvents.filter((event) => event.all_day)
        const timed = dayEvents.filter((event) => !event.all_day)
        return (
          <div key={key} className="min-h-[32rem] border-r last:border-r-0">
            <div className="sticky top-0 border-b bg-background px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                }).format(day)}
              </p>
              <span
                className={`mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm ${key === today ? "bg-blue-600 text-white" : ""}`}
              >
                {day.getDate()}
              </span>
            </div>
            <div className="min-h-10 space-y-1 border-b bg-muted/20 p-1">
              {allDay.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  compact
                  event={event}
                  onClick={() => onSelect(event)}
                />
              ))}
            </div>
            <div className="space-y-1 p-1.5">
              {timed.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  onClick={() => onSelect(event)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function startOfWeek(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - date.getDay())
  return date
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
