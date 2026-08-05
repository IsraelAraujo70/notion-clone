import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useGoogleCalendarEvents } from "./use-google-calendar-events"

const mocks = vi.hoisted(() => ({
  listCalendarEvents: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  api: { listCalendarEvents: mocks.listCalendarEvents },
}))

const range = {
  start: "2026-07-01T00:00:00Z",
  end: "2026-08-01T00:00:00Z",
  timezone: "America/Sao_Paulo",
}

describe("useGoogleCalendarEvents", () => {
  beforeEach(() => {
    mocks.listCalendarEvents.mockReset()
  })

  it("derives loading state from the active request and clears disabled data", async () => {
    let resolveEvents: (events: never[]) => void = () => undefined
    mocks.listCalendarEvents.mockImplementation(
      () =>
        new Promise<never[]>((resolve) => {
          resolveEvents = resolve
        })
    )

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useGoogleCalendarEvents({
          token: "token",
          workspaceId: "workspace",
          databaseId: "database",
          range,
          enabled,
        }),
      { initialProps: { enabled: false } }
    )

    expect(result.current).toMatchObject({
      events: [],
      loading: false,
      error: null,
    })
    expect(mocks.listCalendarEvents).not.toHaveBeenCalled()

    rerender({ enabled: true })

    expect(result.current.loading).toBe(true)
    expect(mocks.listCalendarEvents).toHaveBeenCalledWith(
      "token",
      "workspace",
      "database",
      range,
      expect.any(AbortSignal)
    )

    await act(async () => {
      resolveEvents([])
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ enabled: false })
    expect(result.current).toMatchObject({
      events: [],
      loading: false,
      error: null,
    })
  })
})
