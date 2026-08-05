import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DatabaseCalendar } from "./database-calendar"
import type { CalendarProjectionEvent } from "@/lib/api"

const refresh = vi.fn()
const events: CalendarProjectionEvent[] = [
  {
    id: "google:source:event",
    origin: "google",
    row_id: null,
    source_id: "source",
    google_event_id: "event",
    title: "Design review",
    start: "2026-07-31T14:00:00Z",
    end: "2026-07-31T15:00:00Z",
    time_zone: "UTC",
    all_day: false,
    status: "confirmed",
    meet_url: "https://meet.google.com/abc-defg-hij",
    location: null,
    google_url: "https://calendar.google.com/event?id=event",
    color: "#2563eb",
    private: true,
  },
  {
    id: "google:source:cancelled",
    origin: "materialized",
    row_id: "row-1",
    source_id: "source",
    google_event_id: "cancelled",
    title: "Cancelled planning",
    start: "2026-07-31",
    end: "2026-08-01",
    time_zone: null,
    all_day: true,
    status: "cancelled",
    meet_url: null,
    location: null,
    google_url: null,
    color: null,
    private: false,
  },
]

vi.mock(
  "@/components/google-calendar/hooks/use-google-calendar-events",
  () => ({
    useGoogleCalendarEvents: () => ({
      events,
      loading: false,
      error: null,
      refresh,
    }),
  })
)

describe("DatabaseCalendar", () => {
  beforeEach(() => refresh.mockClear())

  afterEach(() => vi.useRealTimers())

  it("shows timed events with their start time in the month view", () => {
    render(
      <DatabaseCalendar
        databaseId="database"
        defaultMode="month"
        readOnly={false}
      />
    )

    expect(screen.getAllByText("14:00").length).toBeGreaterThan(0)
    expect(screen.queryByText("00:00")).not.toBeInTheDocument()
  })

  it("materializes a private Google event and opens the acknowledged row", async () => {
    const onAddNotes = vi.fn().mockResolvedValue("row-created")
    const onOpenRow = vi.fn()
    render(
      <DatabaseCalendar
        databaseId="database"
        token="token"
        workspaceId="workspace"
        defaultMode="month"
        readOnly={false}
        onAddNotes={onAddNotes}
        onOpenRow={onOpenRow}
      />
    )

    fireEvent.click(
      screen.getAllByRole("button", { name: "Design review" })[0]!
    )
    fireEvent.click(screen.getByRole("button", { name: "Adicionar notas" }))

    await waitFor(() => expect(onAddNotes).toHaveBeenCalledWith(events[0]))
    expect(onOpenRow).toHaveBeenCalledWith("row-created")
    expect(refresh).toHaveBeenCalled()
  })

  it("keeps cancelled materialized events linked to their notes", () => {
    const onOpenRow = vi.fn()
    render(
      <DatabaseCalendar
        databaseId="database"
        defaultMode="month"
        readOnly={false}
        onOpenRow={onOpenRow}
      />
    )

    fireEvent.click(
      screen.getAllByRole("button", { name: "Cancelled planning" })[0]!
    )
    expect(screen.getByText(/evento foi cancelado/i)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Abrir notas" }))
    expect(onOpenRow).toHaveBeenCalledWith("row-1")
  })

  it("does not skip a short month when navigating from day 31", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 12))
    render(
      <DatabaseCalendar
        databaseId="database"
        defaultMode="month"
        readOnly={false}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Próximo período" }))

    expect(screen.getByText(/february|fevereiro/i)).toBeVisible()
  })
})
