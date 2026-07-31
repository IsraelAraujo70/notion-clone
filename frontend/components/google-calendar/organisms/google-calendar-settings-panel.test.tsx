import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GoogleCalendarSettingsPanel } from "./google-calendar-settings-panel"

const mocks = vi.hoisted(() => ({
  getGoogleCalendarSources: vi.fn(),
  listGoogleCalendarConnections: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  api: {
    getGoogleCalendarSources: mocks.getGoogleCalendarSources,
    listGoogleCalendarConnections: mocks.listGoogleCalendarConnections,
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
  })

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
})
