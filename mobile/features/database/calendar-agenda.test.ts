import type { CalendarProjectionEvent } from "@reason/core/contracts"
import { describe, expect, it } from "vitest"

import {
  calendarAgendaRange,
  formatCalendarEventRange,
  formatCalendarEventTime,
  groupCalendarAgendaEvents,
} from "./calendar-agenda"

const timedEvent: CalendarProjectionEvent = {
  id: "google:source:timed",
  origin: "google",
  row_id: null,
  source_id: "source",
  google_event_id: "timed",
  title: "Auction test",
  start: "2026-07-31T18:00:00Z",
  end: "2026-07-31T19:00:00Z",
  time_zone: "America/Sao_Paulo",
  all_day: false,
  status: "confirmed",
  meet_url: null,
  location: null,
  google_url: null,
  color: "#2563eb",
  private: true,
}

describe("mobile calendar agenda", () => {
  it("requests exactly the selected local month", () => {
    const range = calendarAgendaRange(new Date(2026, 6, 15, 12))
    const start = new Date(range.start)
    const end = new Date(range.end)

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([
      2026, 6, 1,
    ])
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([
      2026, 7, 1,
    ])
  })

  it("groups timed and multi-day all-day events by their visible dates", () => {
    const allDay: CalendarProjectionEvent = {
      ...timedEvent,
      id: "google:source:all-day",
      title: "Planning retreat",
      start: "2026-07-31",
      end: "2026-08-02",
      time_zone: null,
      all_day: true,
    }
    const lateEvent: CalendarProjectionEvent = {
      ...timedEvent,
      id: "google:source:late",
      title: "Late sync",
      start: "2026-07-31T02:00:00Z",
      end: "2026-07-31T02:30:00Z",
    }

    const groups = groupCalendarAgendaEvents(
      [timedEvent, allDay, lateEvent],
      "America/Sao_Paulo"
    )

    expect(groups.map((group) => group.date)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ])
    expect(groups[1]!.events.map((event) => event.title)).toEqual([
      "Planning retreat",
      "Auction test",
    ])
  })

  it("formats start times in the event timezone without timing all-day events", () => {
    expect(
      formatCalendarEventTime(timedEvent, "America/Sao_Paulo", "pt-BR")
    ).toBe("15:00")
    expect(
      formatCalendarEventTime(
        { ...timedEvent, all_day: true },
        "America/Sao_Paulo",
        "pt-BR"
      )
    ).toBe("Dia inteiro")
  })

  it("shows the inclusive date span for multi-day all-day events", () => {
    expect(
      formatCalendarEventRange(
        {
          ...timedEvent,
          start: "2026-07-31",
          end: "2026-08-02",
          all_day: true,
        },
        "America/Sao_Paulo",
        "en-US"
      )
    ).toBe("Jul 31, 2026 – Aug 1, 2026 · dia inteiro")
  })
})
