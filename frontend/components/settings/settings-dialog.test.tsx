import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsDialog } from "@/components/settings/settings-dialog"
import {
  PAGE_FULL_WIDTH_STORAGE_KEY,
  PageLayoutProvider,
} from "@/components/editor/page-layout-provider"

const mocks = vi.hoisted(() => ({
  activeWorkspace: {
    id: "workspace-1",
    name: "Product",
    role: "owner" as "owner" | "editor" | "viewer",
    created_at: "2026-07-08T12:00:00Z",
  },
  activeRole: "owner" as "owner" | "editor" | "viewer",
  changePassword: vi.fn(),
  createMcpToken: vi.fn(),
  deleteWorkspace: vi.fn(),
  inviteWorkspaceMember: vi.fn(),
  listWorkspaceInvites: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  listMcpTokens: vi.fn(),
  setMode: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  revokeMcpToken: vi.fn(),
  selectWorkspace: vi.fn(),
  setTheme: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  workspaces: [
    {
      id: "workspace-1",
      name: "Product",
      role: "owner" as "owner" | "editor" | "viewer",
      created_at: "2026-07-08T12:00:00Z",
    },
    {
      id: "workspace-2",
      name: "Design",
      role: "owner" as "owner" | "editor" | "viewer",
      created_at: "2026-07-08T12:00:00Z",
    },
  ],
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    token: "secret-token",
    user: {
      id: "user-1",
      email: "israel@example.com",
      display_name: "Israel Oliveira",
      created_at: "2026-07-08T12:00:00Z",
    },
  }),
}))

vi.mock("@/components/theme/theme-provider", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    useAppTheme: () => {
      const [theme, setThemeState] = React.useState("default")
      const [mode, setModeState] = React.useState("light")

      return {
        mode,
        theme,
        setMode: (nextMode: string) => {
          mocks.setMode(nextMode)
          setModeState(nextMode)
        },
        setTheme: (nextTheme: string) => {
          mocks.setTheme(nextTheme)
          setThemeState(nextTheme)
        },
      }
    },
  }
})

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({
    activeWorkspace: mocks.activeWorkspace,
    deleteWorkspace: mocks.deleteWorkspace,
    selectWorkspace: mocks.selectWorkspace,
    workspaces: mocks.workspaces,
  }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    changePassword: mocks.changePassword,
    createMcpToken: mocks.createMcpToken,
    deleteWorkspace: mocks.deleteWorkspace,
    inviteWorkspaceMember: mocks.inviteWorkspaceMember,
    listWorkspaceInvites: mocks.listWorkspaceInvites,
    listWorkspaceMembers: mocks.listWorkspaceMembers,
    listMcpTokens: mocks.listMcpTokens,
    removeWorkspaceMember: mocks.removeWorkspaceMember,
    revokeMcpToken: mocks.revokeMcpToken,
    updateWorkspaceMemberRole: mocks.updateWorkspaceMemberRole,
  },
}))

const members = [
  {
    user_id: "user-1",
    email: "israel@example.com",
    display_name: "Israel Oliveira",
    role: "owner",
    joined_at: "2026-07-08T12:00:00Z",
  },
  {
    user_id: "user-2",
    email: "person@example.com",
    display_name: "Person Example",
    role: "editor",
    joined_at: "2026-07-08T12:00:00Z",
  },
]

const invites = [
  {
    id: "invite-1",
    workspace_id: "workspace-1",
    email: "pending@example.com",
    role: "viewer",
    expires_at: "2026-07-15T12:00:00Z",
    created_at: "2026-07-08T12:00:00Z",
  },
]

const existingIntegration = {
  id: "integration-old",
  name: "Claude Desktop",
  scopes: ["content:read", "search:read"],
  workspace_ids: ["workspace-1"],
  expires_at: "2026-08-08T12:00:00Z",
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-08T12:00:00Z",
}

const createdIntegration = {
  token: "rsn_mcp_created-secret",
  integration: {
    ...existingIntegration,
    id: "integration-new",
    name: "OpenCode no MacBook",
    scopes: ["content:read", "content:write", "search:read", "media:read"],
  },
}

function renderSettings() {
  return render(
    <PageLayoutProvider>
      <SettingsDialog open onOpenChange={vi.fn()} />
    </PageLayoutProvider>
  )
}

describe("SettingsDialog", () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.activeRole = "owner"
    mocks.activeWorkspace.role = "owner"
    mocks.workspaces[0].role = "owner"
    mocks.changePassword.mockReset().mockResolvedValue(undefined)
    mocks.createMcpToken.mockReset().mockResolvedValue(createdIntegration)
    mocks.deleteWorkspace.mockReset().mockResolvedValue(undefined)
    mocks.inviteWorkspaceMember.mockReset().mockResolvedValue(invites[0])
    mocks.listWorkspaceInvites.mockReset().mockResolvedValue(invites)
    mocks.listWorkspaceMembers.mockReset().mockResolvedValue(members)
    mocks.listMcpTokens.mockReset().mockResolvedValue([existingIntegration])
    mocks.removeWorkspaceMember.mockReset().mockResolvedValue(undefined)
    mocks.revokeMcpToken.mockReset().mockResolvedValue(undefined)
    mocks.selectWorkspace.mockReset()
    mocks.setMode.mockReset()
    mocks.setTheme.mockReset()
    mocks.updateWorkspaceMemberRole.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it("renders account, workspace, integrations and appearance tabs", () => {
    renderSettings()

    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Workspace" })).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "Integrations" })
    ).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument()
  })

  it("creates, copies and revokes MCP tokens", async () => {
    renderSettings()

    await userEvent.click(screen.getByRole("tab", { name: "Integrations" }))
    expect(await screen.findByText("Claude Desktop")).toBeInTheDocument()

    await userEvent.type(
      screen.getByLabelText("Integration name"),
      "OpenCode no MacBook"
    )
    await userEvent.click(screen.getByRole("button", { name: "Create token" }))

    await waitFor(() => {
      expect(mocks.createMcpToken).toHaveBeenCalledWith("secret-token", {
        name: "OpenCode no MacBook",
        scopes: ["content:read", "content:write", "search:read", "media:read"],
        workspace_ids: ["workspace-1"],
        expires_in_days: 30,
      })
    })
    expect(screen.getByLabelText("Created MCP token")).toHaveValue(
      "rsn_mcp_created-secret"
    )

    await userEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "rsn_mcp_created-secret"
    )

    await userEvent.click(
      screen.getByRole("button", { name: "Revoke Claude Desktop" })
    )
    await waitFor(() => {
      expect(mocks.revokeMcpToken).toHaveBeenCalledWith(
        "secret-token",
        "integration-old"
      )
    })
  })

  it("changes password and theme", async () => {
    renderSettings()

    await userEvent.type(
      screen.getByLabelText("Current password"),
      "Password123!"
    )
    await userEvent.type(
      screen.getByLabelText("New password"),
      "NewPassword123!"
    )
    await userEvent.type(
      screen.getByLabelText("Confirm new password"),
      "NewPassword123!"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Change password" })
    )

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledWith("secret-token", {
        current_password: "Password123!",
        new_password: "NewPassword123!",
      })
    })

    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }))
    await userEvent.click(screen.getByRole("radio", { name: "GitHub" }))
    await userEvent.click(screen.getByRole("radio", { name: "Evergreen" }))
    await userEvent.click(screen.getByRole("radio", { name: "Default" }))
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }))
    await userEvent.click(screen.getByRole("radio", { name: "Light" }))

    expect(mocks.setTheme).toHaveBeenCalledWith("github")
    expect(mocks.setTheme).toHaveBeenCalledWith("evergreen")
    expect(mocks.setTheme).toHaveBeenCalledWith("default")
    expect(mocks.setMode).toHaveBeenCalledWith("dark")
    expect(mocks.setMode).toHaveBeenCalledWith("light")
  })

  it("changes and persists the page width preference", async () => {
    renderSettings()

    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }))
    const fullWidth = screen.getByRole("checkbox", { name: "Full width" })
    expect(fullWidth).not.toBeChecked()

    await userEvent.click(fullWidth)

    expect(fullWidth).toBeChecked()
    expect(localStorage.getItem(PAGE_FULL_WIDTH_STORAGE_KEY)).toBe("true")
  })

  it("lets an owner invite, update roles and remove members", async () => {
    renderSettings()

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    await screen.findByText("Selected workspace")

    await userEvent.click(screen.getAllByRole("combobox")[0])
    await userEvent.click(screen.getByRole("option", { name: "Design" }))
    expect(mocks.selectWorkspace).toHaveBeenCalledWith("workspace-2")

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com")
    await userEvent.click(
      screen.getByRole("button", { name: "Send invitation" })
    )
    await waitFor(() => {
      expect(mocks.inviteWorkspaceMember).toHaveBeenCalledWith(
        "secret-token",
        "workspace-1",
        { email: "new@example.com", role: "editor" }
      )
    })

    const memberRow = screen.getByText("person@example.com").closest("tr")
    expect(memberRow).not.toBeNull()
    await userEvent.click(within(memberRow!).getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Viewer" }))

    await waitFor(() => {
      expect(mocks.updateWorkspaceMemberRole).toHaveBeenCalledWith(
        "secret-token",
        "workspace-1",
        "user-2",
        "viewer"
      )
    })

    await userEvent.click(screen.getByLabelText("Remove person@example.com"))
    await waitFor(() => {
      expect(mocks.removeWorkspaceMember).toHaveBeenCalledWith(
        "secret-token",
        "workspace-1",
        "user-2"
      )
    })
  })

  it("requires the workspace name before hard deleting it", async () => {
    renderSettings()

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    await screen.findByText("Danger zone")

    const deleteButton = screen.getByRole("button", {
      name: "Delete workspace",
    })
    expect(deleteButton).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText("Type Product to confirm"),
      "Product"
    )
    await waitFor(() => expect(deleteButton).toBeEnabled())
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mocks.deleteWorkspace).toHaveBeenCalledWith("workspace-1")
    })
  })

  it("blocks management actions when the active member is not owner", async () => {
    mocks.activeRole = "viewer"
    mocks.activeWorkspace.role = "viewer"
    mocks.workspaces[0].role = "viewer"
    renderSettings()

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    expect(
      await screen.findByText("Only owners can manage members and invitations.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Send invitation" })
    ).not.toBeInTheDocument()
    expect(mocks.listWorkspaceInvites).not.toHaveBeenCalled()
  })
})
