import {
  calendarDayKey,
  calendarMonthDays,
  databaseCalendarConfig,
  databaseDateDayKeys,
  databaseDateOverlaps,
  databaseView,
  normalizeDatabaseDateValue,
} from "@reason/core/database"
import { describe, expect, it } from "vitest"

describe("database calendar contract", () => {
  it("keeps legacy dates as one all-day event", () => {
    expect(normalizeDatabaseDateValue("2026-07-31")).toEqual({
      start: "2026-07-31",
      allDay: true,
      startMs: Date.UTC(2026, 6, 31),
      endMs: Date.UTC(2026, 7, 1),
    })
  })

  it("normalizes rich all-day and timed intervals", () => {
    expect(
      normalizeDatabaseDateValue({
        start: "2026-07-31",
        end: "2026-08-02",
        allDay: true,
        timeZone: "America/Sao_Paulo",
      })
    ).toMatchObject({
      start: "2026-07-31",
      end: "2026-08-02",
      allDay: true,
      timeZone: "America/Sao_Paulo",
    })
    expect(
      normalizeDatabaseDateValue({
        start: "2026-07-31T14:00:00-03:00",
        end: "2026-07-31T15:30:00-03:00",
        timeZone: "America/Sao_Paulo",
      })
    ).toMatchObject({
      allDay: false,
      startMs: Date.parse("2026-07-31T17:00:00Z"),
      endMs: Date.parse("2026-07-31T18:30:00Z"),
    })
  })

  it("rejects rollover dates, local timed values and inverted ranges", () => {
    expect(normalizeDatabaseDateValue("2026-02-30")).toBeNull()
    expect(
      normalizeDatabaseDateValue({ start: "2026-07-31T14:00:00" })
    ).toBeNull()
    expect(
      normalizeDatabaseDateValue({
        start: "2026-07-31T15:00:00Z",
        end: "2026-07-31T14:00:00Z",
      })
    ).toBeNull()
  })

  it("uses half-open interval overlap semantics", () => {
    const value = {
      start: "2026-07-31T14:00:00Z",
      end: "2026-07-31T15:00:00Z",
    }
    expect(
      databaseDateOverlaps(
        value,
        Date.parse("2026-07-31T13:59:00Z"),
        Date.parse("2026-07-31T14:01:00Z")
      )
    ).toBe(true)
    expect(
      databaseDateOverlaps(
        value,
        Date.parse("2026-07-31T15:00:00Z"),
        Date.parse("2026-07-31T16:00:00Z")
      )
    ).toBe(false)
  })

  it("groups timed events correctly across DST boundaries", () => {
    expect(calendarDayKey("2026-03-08T06:30:00Z", "America/New_York")).toBe(
      "2026-03-08"
    )
    expect(calendarDayKey("2026-03-08T04:30:00Z", "America/New_York")).toBe(
      "2026-03-07"
    )
    expect(
      databaseDateDayKeys(
        {
          start: "2026-03-08T01:30:00-05:00",
          end: "2026-03-08T03:30:00-04:00",
          timeZone: "America/New_York",
        },
        "America/New_York"
      )
    ).toEqual(["2026-03-08"])
  })

  it("lays out a stable six-week month grid", () => {
    const days = calendarMonthDays(2026, 8, 1)
    expect(days).toHaveLength(42)
    expect(days[0]).toEqual({ date: "2026-07-27", inMonth: false })
    expect(days[5]).toEqual({ date: "2026-08-01", inMonth: true })
    expect(days.at(-1)).toEqual({ date: "2026-09-06", inMonth: false })
  })

  it("normalizes view and calendar configuration defensively", () => {
    expect(databaseView({ view: "calendar" })).toBe("calendar")
    expect(databaseView({ view: "unknown" })).toBe("table")
    expect(
      databaseCalendarConfig({
        calendar: { datePropertyId: "meeting_at", defaultMode: "week" },
      })
    ).toEqual({ datePropertyId: "meeting_at", defaultMode: "week" })
    expect(
      databaseCalendarConfig({ calendar: { defaultMode: "agenda" } })
    ).toEqual({
      defaultMode: "month",
    })
  })
})
