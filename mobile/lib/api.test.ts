import { afterEach, describe, expect, it, vi } from "vitest"

import { API_BASE_URL, api } from "./api"

describe("mobile calendar API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("requests a workspace-scoped calendar projection with auth and range", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "[]",
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    await api.listCalendarEvents(
      "token",
      "workspace",
      "database",
      {
        start: "2026-07-01T03:00:00.000Z",
        end: "2026-08-01T03:00:00.000Z",
        timezone: "America/Sao_Paulo",
      },
      controller.signal
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/workspaces/workspace/databases/database/calendar/events?start=2026-07-01T03%3A00%3A00.000Z&end=2026-08-01T03%3A00%3A00.000Z&timezone=America%2FSao_Paulo`,
      expect.objectContaining({
        headers: { Authorization: "Bearer token" },
        signal: controller.signal,
      })
    )
  })
})
