import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { CalendarProjectionEvent } from "@/lib/api"
import { CalendarEventCard } from "./calendar-event-card"

const timedEvent: CalendarProjectionEvent = {
  id: "google:source:event",
  origin: "google",
  row_id: null,
  source_id: "source",
  google_event_id: "event",
  title: "Design review",
  start: "2026-07-31T18:00:00Z",
  end: "2026-07-31T19:00:00Z",
  time_zone: "America/Sao_Paulo",
  all_day: false,
  status: "confirmed",
  meet_url: null,
  location: null,
  google_url: null,
  color: "#2563eb",
  private: false,
}

describe("CalendarEventCard", () => {
  it("shows the event start time in its own timezone", () => {
    render(<CalendarEventCard event={timedEvent} onClick={vi.fn()} />)

    expect(screen.getByText("15:00")).toBeVisible()
    expect(screen.getByTitle("15:00 Design review")).toBeVisible()
  })

  it("does not invent a time for an all-day event", () => {
    render(
      <CalendarEventCard
        event={{
          ...timedEvent,
          title: "Planning day",
          start: "2026-07-31",
          end: "2026-08-01",
          time_zone: null,
          all_day: true,
        }}
        onClick={vi.fn()}
      />
    )

    expect(screen.queryByRole("time")).not.toBeInTheDocument()
    expect(screen.getByTitle("Planning day")).toBeVisible()
  })
})
