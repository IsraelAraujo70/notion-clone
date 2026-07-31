import type { BlockProperties, JsonValue } from "./contracts"

export type DatabaseView = "table" | "board" | "calendar"

export type DatabaseCalendarMode = "month" | "week"

export type DatabaseDateValue =
  | string
  | {
      start: string
      end?: string
      timeZone?: string
      allDay?: boolean
    }

export interface DatabaseCalendarConfig {
  datePropertyId?: string
  defaultMode: DatabaseCalendarMode
}

export interface NormalizedDatabaseDateValue {
  start: string
  end?: string
  timeZone?: string
  allDay: boolean
  startMs: number
  endMs: number
}

export interface CalendarMonthDay {
  date: string
  inMonth: boolean
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const RFC3339_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
const ONE_DAY_MS = 86_400_000
const DEFAULT_TIMED_DURATION_MS = 3_600_000

export type DatabasePropertyType =
  "title" | "text" | "number" | "checkbox" | "status" | "tags" | "date"

export interface DatabaseProperty {
  id: string
  name: string
  type: DatabasePropertyType
  width?: number
  options?: string[]
}

export interface DatabaseStatus {
  id: string
  name: string
  color: "gray" | "blue" | "green" | "yellow" | "red" | "purple"
}

export const DEFAULT_DATABASE_PROPERTIES: readonly DatabaseProperty[] = [
  { id: "title", name: "Name", type: "title" },
  { id: "status", name: "Status", type: "status" },
]

export const DEFAULT_DATABASE_STATUSES: readonly DatabaseStatus[] = [
  { id: "not_started", name: "Not started", color: "gray" },
  { id: "in_progress", name: "In progress", color: "blue" },
  { id: "done", name: "Done", color: "green" },
]

export function defaultDatabaseProperties(): BlockProperties {
  return {
    title: "",
    view: "table",
    statuses: DEFAULT_DATABASE_STATUSES.map((status) => ({ ...status })),
    schema: DEFAULT_DATABASE_PROPERTIES.map((property) => ({ ...property })),
  }
}

export function databaseView(properties: BlockProperties): DatabaseView {
  return properties.view === "board" || properties.view === "calendar"
    ? properties.view
    : "table"
}

export function databaseCalendarConfig(
  properties: BlockProperties
): DatabaseCalendarConfig {
  const calendar = properties.calendar
  if (!isObject(calendar)) return { defaultMode: "month" }
  const datePropertyId =
    typeof calendar.datePropertyId === "string" &&
    calendar.datePropertyId.trim().length > 0
      ? calendar.datePropertyId
      : undefined
  return {
    ...(datePropertyId ? { datePropertyId } : {}),
    defaultMode: calendar.defaultMode === "week" ? "week" : "month",
  }
}

export function normalizeDatabaseDateValue(
  value: JsonValue | undefined
): NormalizedDatabaseDateValue | null {
  if (typeof value === "string") {
    if (!isIsoDate(value)) return null
    const startMs = dateOnlyToUtc(value)
    return {
      start: value,
      allDay: true,
      startMs,
      endMs: startMs + ONE_DAY_MS,
    }
  }
  if (!isObject(value) || typeof value.start !== "string") return null

  const explicitAllDay = value.allDay === true
  const inferredAllDay = isIsoDate(value.start)
  const allDay = explicitAllDay || inferredAllDay
  if (allDay) {
    if (!isIsoDate(value.start)) return null
    if (
      value.end !== undefined &&
      (typeof value.end !== "string" || !isIsoDate(value.end))
    )
      return null
    const startMs = dateOnlyToUtc(value.start)
    const endMs =
      typeof value.end === "string"
        ? dateOnlyToUtc(value.end)
        : startMs + ONE_DAY_MS
    if (endMs <= startMs) return null
    return {
      start: value.start,
      ...(typeof value.end === "string" ? { end: value.end } : {}),
      ...(validTimeZone(value.timeZone) ? { timeZone: value.timeZone } : {}),
      allDay: true,
      startMs,
      endMs,
    }
  }

  if (!RFC3339_INSTANT.test(value.start)) return null
  if (value.end !== undefined && !RFC3339_INSTANT.test(String(value.end)))
    return null
  const startMs = Date.parse(value.start)
  const endMs =
    typeof value.end === "string"
      ? Date.parse(value.end)
      : startMs + DEFAULT_TIMED_DURATION_MS
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return null
  return {
    start: value.start,
    ...(typeof value.end === "string" ? { end: value.end } : {}),
    ...(validTimeZone(value.timeZone) ? { timeZone: value.timeZone } : {}),
    allDay: false,
    startMs,
    endMs,
  }
}

export function databaseDateValueToJson(
  value: NormalizedDatabaseDateValue
): DatabaseDateValue {
  if (value.allDay && !value.end && !value.timeZone) return value.start
  return {
    start: value.start,
    ...(value.end ? { end: value.end } : {}),
    ...(value.timeZone ? { timeZone: value.timeZone } : {}),
    ...(value.allDay ? { allDay: true } : {}),
  }
}

export function databaseDateOverlaps(
  value: JsonValue | undefined,
  rangeStartMs: number,
  rangeEndMs: number
): boolean {
  const normalized = normalizeDatabaseDateValue(value)
  return (
    normalized !== null &&
    rangeStartMs < rangeEndMs &&
    normalized.startMs < rangeEndMs &&
    normalized.endMs > rangeStartMs
  )
}

export function calendarDayKey(
  instant: string | number | Date,
  timeZone: string
): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (!Number.isFinite(date.getTime()) || !validTimeZone(timeZone)) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function databaseDateDayKeys(
  value: JsonValue | undefined,
  displayTimeZone: string
): string[] {
  const normalized = normalizeDatabaseDateValue(value)
  if (!normalized) return []
  if (normalized.allDay) {
    return enumerateIsoDates(
      normalized.start,
      normalized.end ?? addIsoDays(normalized.start, 1)
    )
  }
  const first = calendarDayKey(normalized.startMs, displayTimeZone)
  const last = calendarDayKey(normalized.endMs - 1, displayTimeZone)
  return first && last ? enumerateIsoDates(first, addIsoDays(last, 1)) : []
}

export function calendarMonthDays(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 0
): CalendarMonthDay[] {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return []
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (first.getUTCDay() - weekStartsOn + 7) % 7
  const start = new Date(first.getTime() - offset * ONE_DAY_MS)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * ONE_DAY_MS)
    return {
      date: isoDateFromUtc(date),
      inMonth: date.getUTCMonth() === month - 1,
    }
  })
}

export function databaseStatuses(
  properties: BlockProperties
): DatabaseStatus[] {
  const statuses = properties.statuses
  if (!Array.isArray(statuses)) return [...DEFAULT_DATABASE_STATUSES]

  const parsed = statuses.flatMap((value) => {
    if (!isObject(value)) return []
    const { id, name, color } = value
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      !["gray", "blue", "green", "yellow", "red", "purple"].includes(
        String(color)
      )
    ) {
      return []
    }
    return [{ id, name, color: color as DatabaseStatus["color"] }]
  })
  return parsed.length > 0 ? parsed : [...DEFAULT_DATABASE_STATUSES]
}

export function databaseProperties(
  properties: BlockProperties
): DatabaseProperty[] {
  const schema = properties.schema
  if (!Array.isArray(schema)) return cloneDefaultProperties()

  const parsed = schema.flatMap((value) => {
    if (!isObject(value)) return []
    const { id, name, type, width, options } = value
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      ![
        "title",
        "text",
        "number",
        "checkbox",
        "status",
        "tags",
        "date",
      ].includes(String(type)) ||
      (width !== undefined &&
        (typeof width !== "number" || !Number.isFinite(width))) ||
      (options !== undefined && !Array.isArray(options))
    ) {
      return []
    }
    return [
      {
        id,
        name,
        type: type as DatabasePropertyType,
        ...(typeof width === "number" ? { width } : {}),
        ...(Array.isArray(options)
          ? {
              options: options.filter(
                (option, index): option is string =>
                  typeof option === "string" &&
                  option.trim().length > 0 &&
                  options.findIndex((candidate) => candidate === option) ===
                    index
              ),
            }
          : {}),
      },
    ]
  })

  const title = parsed.find((property) => property.type === "title")
  const normalized = [
    {
      ...(title ?? DEFAULT_DATABASE_PROPERTIES[0]!),
      id: "title",
      type: "title" as const,
    },
    ...parsed
      .filter(
        (property) =>
          property.type !== "title" &&
          property.id !== "title" &&
          !(property.id === "status" && property.type !== "status")
      )
      .map((property) =>
        property.type === "status" ? { ...property, id: "status" } : property
      ),
  ]
  const unique = normalized.filter(
    (property, index) =>
      normalized.findIndex((candidate) => candidate.id === property.id) ===
      index
  )
  return unique
}

export function databaseRowStatus(
  properties: BlockProperties,
  statuses: readonly DatabaseStatus[]
): string {
  const status = properties.status
  return typeof status === "string" &&
    statuses.some((item) => item.id === status)
    ? status
    : statuses[0]!.id
}

function isObject(value: unknown): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function dateOnlyToUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function isoDateFromUtc(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(
    date.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`
}

function addIsoDays(value: string, days: number): string {
  return isoDateFromUtc(new Date(dateOnlyToUtc(value) + days * ONE_DAY_MS))
}

function enumerateIsoDates(start: string, endExclusive: string): string[] {
  const dates: string[] = []
  for (
    let cursor = dateOnlyToUtc(start), end = dateOnlyToUtc(endExclusive);
    cursor < end && dates.length < 3_660;
    cursor += ONE_DAY_MS
  ) {
    dates.push(isoDateFromUtc(new Date(cursor)))
  }
  return dates
}

function validTimeZone(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || value.length > 100) return false
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

function cloneDefaultProperties(): DatabaseProperty[] {
  return DEFAULT_DATABASE_PROPERTIES.map((property) => ({ ...property }))
}
