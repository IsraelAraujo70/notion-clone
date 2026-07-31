import type { CalendarProjectionEvent } from "@reason/core/contracts"
import { databaseDateDayKeys } from "@reason/core/database"

export type CalendarAgendaGroup = {
  date: string
  events: CalendarProjectionEvent[]
}

export function calendarAgendaRange(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function groupCalendarAgendaEvents(
  events: CalendarProjectionEvent[],
  displayTimeZone: string
): CalendarAgendaGroup[] {
  const grouped = new Map<string, CalendarProjectionEvent[]>()

  for (const event of events) {
    const value = {
      start: event.start,
      end: event.end,
      ...(event.time_zone ? { timeZone: event.time_zone } : {}),
      ...(event.all_day ? { allDay: true } : {}),
    }
    for (const date of databaseDateDayKeys(value, displayTimeZone)) {
      grouped.set(date, [...(grouped.get(date) ?? []), event])
    }
  }

  return [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedEvents]) => ({
      date,
      events: [...groupedEvents].sort(compareCalendarEvents),
    }))
}

export function formatCalendarEventTime(
  event: CalendarProjectionEvent,
  displayTimeZone: string,
  locale = "pt-BR"
) {
  if (event.all_day) return "Dia inteiro"
  return formatTime(event.start, event.time_zone ?? displayTimeZone, locale)
}

export function formatCalendarEventRange(
  event: CalendarProjectionEvent,
  displayTimeZone: string,
  locale = "pt-BR"
) {
  if (event.all_day) {
    const start = formatDateOnly(event.start, locale)
    const lastDate = previousDate(event.end)
    const end =
      lastDate && lastDate !== event.start
        ? ` – ${formatDateOnly(lastDate, locale)}`
        : ""
    return `${start}${end} · dia inteiro`
  }

  const timeZone = event.time_zone ?? displayTimeZone
  const start = new Date(event.start)
  const end = new Date(event.end)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "Horário indisponível"
  }
  const startDate = formatDate(start, timeZone, locale)
  const endDate = formatDate(end, timeZone, locale)
  const startTime = formatTime(event.start, timeZone, locale)
  const endTime = formatTime(event.end, timeZone, locale)
  return startDate === endDate
    ? `${startDate}, ${startTime}–${endTime}`
    : `${startDate}, ${startTime} – ${endDate}, ${endTime}`
}

export function resolvedCalendarTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function compareCalendarEvents(
  left: CalendarProjectionEvent,
  right: CalendarProjectionEvent
) {
  if (left.all_day !== right.all_day) return left.all_day ? -1 : 1
  const difference = Date.parse(left.start) - Date.parse(right.start)
  return Number.isFinite(difference) && difference !== 0
    ? difference
    : left.title.localeCompare(right.title)
}

function formatTime(value: string, timeZone: string, locale: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "--:--"
  return formatter(
    locale,
    { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    timeZone
  ).format(date)
}

function formatDate(value: Date, timeZone: string, locale: string) {
  return formatter(
    locale,
    { day: "numeric", month: "short", year: "numeric" },
    timeZone
  ).format(value)
}

function formatDateOnly(value: string, locale: string) {
  const date = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function previousDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function formatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string
) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone })
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })
  }
}
