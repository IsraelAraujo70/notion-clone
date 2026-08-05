import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GoogleCalendarSettingsPanel } from "./google-calendar-settings-panel"

const mocks = vi.hoisted(() => ({
  getGoogleCalendarSources: vi.fn(),
  listGoogleCalendarConnections: vi.fn(),
  replaceGoogleCalendarSources: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  api: {
    getGoogleCalendarSources: mocks.getGoogleCalendarSources,
    listGoogleCalendarConnections: mocks.listGoogleCalendarConnections,
    replaceGoogleCalendarSources: mocks.replaceGoogleCalendarSources,
  },
}))

describe("GoogleCalendarSettingsPanel", () => {
  beforeEach(() => {
    mocks.getGoogleCalendarSources.mockReset().mockResolvedValue({
      configured: false,
      sources: [],
      available: [],
    })
    mocks.listGoogleCalendarConnections.mockReset().mockResolvedValue([])
    mocks.replaceGoogleCalendarSources.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it("loads sources from the user action that opens the panel", async () => {
    const user = userEvent.setup()
    render(
      <GoogleCalendarSettingsPanel
        token="token"
        workspaceId="workspace"
        databaseId="database"
        onSourcesChanged={vi.fn()}
      />
    )

    expect(mocks.getGoogleCalendarSources).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Agendas" }))

    await waitFor(() =>
      expect(mocks.getGoogleCalendarSources).toHaveBeenCalledWith(
        "token",
        "workspace",
        "database"
      )
    )
    expect(mocks.listGoogleCalendarConnections).toHaveBeenCalledWith("token")
  })

  it("refreshes events after the first selected source finishes syncing", async () => {
    const onSourcesChanged = vi.fn()
    const available = [
      {
        connection_id: "connection",
        google_calendar_id: "primary",
        display_name: "Principal",
        color: null,
        primary: true,
      },
    ]
    const pendingSource = {
      id: "source",
      workspace_id: "workspace",
      database_block_id: "database",
      connection_id: "connection",
      google_calendar_id: "primary",
      display_name: "Principal",
      color: null,
      enabled: true,
      last_synced_at: null,
      last_error: null,
    }
    mocks.getGoogleCalendarSources
      .mockResolvedValueOnce({ configured: true, sources: [], available })
      .mockResolvedValueOnce({
        configured: true,
        sources: [
          { ...pendingSource, last_synced_at: "2026-08-05T12:00:00Z" },
        ],
        available,
      })
    mocks.replaceGoogleCalendarSources.mockResolvedValue({
      configured: true,
      sources: [pendingSource],
      available,
    })
    render(
      <GoogleCalendarSettingsPanel
        token="token"
        workspaceId="workspace"
        databaseId="database"
        onSourcesChanged={onSourcesChanged}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Agendas" }))
    const checkbox = await screen.findByRole("checkbox", { name: /Principal/ })
    await waitFor(() => expect(checkbox).toBeEnabled())
    fireEvent.click(checkbox)

    await waitFor(
      () => expect(onSourcesChanged).toHaveBeenCalledTimes(2),
      { timeout: 2_000 }
    )
    expect(mocks.getGoogleCalendarSources).toHaveBeenCalledTimes(2)
  })
})
