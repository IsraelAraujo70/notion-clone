import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsDialog } from "@/components/settings/settings-dialog"

const mocks = vi.hoisted(() => ({
  activeWorkspace: {
    id: "workspace-1",
    name: "Product",
    role: "owner" as "owner" | "editor" | "viewer",
    created_at: "2026-07-08T12:00:00Z",
  },
  activeRole: "owner" as "owner" | "editor" | "viewer",
  changePassword: vi.fn(),
  deleteWorkspace: vi.fn(),
  inviteWorkspaceMember: vi.fn(),
  listWorkspaceInvites: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  removeWorkspaceMember: vi.fn(),
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
      const [theme, setThemeState] = React.useState("light")

      return {
        theme,
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
    deleteWorkspace: mocks.deleteWorkspace,
    inviteWorkspaceMember: mocks.inviteWorkspaceMember,
    listWorkspaceInvites: mocks.listWorkspaceInvites,
    listWorkspaceMembers: mocks.listWorkspaceMembers,
    removeWorkspaceMember: mocks.removeWorkspaceMember,
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

describe("SettingsDialog", () => {
  beforeEach(() => {
    mocks.activeRole = "owner"
    mocks.activeWorkspace.role = "owner"
    mocks.workspaces[0].role = "owner"
    mocks.changePassword.mockReset().mockResolvedValue(undefined)
    mocks.deleteWorkspace.mockReset().mockResolvedValue(undefined)
    mocks.inviteWorkspaceMember.mockReset().mockResolvedValue(invites[0])
    mocks.listWorkspaceInvites.mockReset().mockResolvedValue(invites)
    mocks.listWorkspaceMembers.mockReset().mockResolvedValue(members)
    mocks.removeWorkspaceMember.mockReset().mockResolvedValue(undefined)
    mocks.selectWorkspace.mockReset()
    mocks.setTheme.mockReset()
    mocks.updateWorkspaceMemberRole.mockReset().mockResolvedValue(undefined)
  })

  it("renders account, workspace and appearance tabs", () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("tab", { name: "Conta" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Workspace" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Aparência" })).toBeInTheDocument()
  })

  it("changes password and theme", async () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await userEvent.type(screen.getByLabelText("Senha atual"), "Password123!")
    await userEvent.type(screen.getByLabelText("Nova senha"), "NewPassword123!")
    await userEvent.type(
      screen.getByLabelText("Confirmar nova senha"),
      "NewPassword123!"
    )
    await userEvent.click(screen.getByRole("button", { name: "Alterar senha" }))

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledWith("secret-token", {
        current_password: "Password123!",
        new_password: "NewPassword123!",
      })
    })

    await userEvent.click(screen.getByRole("tab", { name: "Aparência" }))
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }))
    await userEvent.click(screen.getByRole("radio", { name: "Evergreen" }))
    await userEvent.click(screen.getByRole("radio", { name: "Light" }))

    expect(mocks.setTheme).toHaveBeenCalledWith("dark")
    expect(mocks.setTheme).toHaveBeenCalledWith("evergreen")
    expect(mocks.setTheme).toHaveBeenCalledWith("light")
  })

  it("lets an owner invite, update roles and remove members", async () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    await screen.findByText("Workspace selecionado")

    await userEvent.click(screen.getAllByRole("combobox")[0])
    await userEvent.click(screen.getByRole("option", { name: "Design" }))
    expect(mocks.selectWorkspace).toHaveBeenCalledWith("workspace-2")

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com")
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar convite" })
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

    await userEvent.click(screen.getByLabelText("Remover person@example.com"))
    await waitFor(() => {
      expect(mocks.removeWorkspaceMember).toHaveBeenCalledWith(
        "secret-token",
        "workspace-1",
        "user-2"
      )
    })
  })

  it("requires the workspace name before hard deleting it", async () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    await screen.findByText("Zona de perigo")

    const deleteButton = screen.getByRole("button", {
      name: "Apagar workspace",
    })
    expect(deleteButton).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText("Digite Product para confirmar"),
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
    render(<SettingsDialog open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByRole("tab", { name: "Workspace" }))
    expect(
      await screen.findByText(
        "Somente owners podem gerenciar membros e convites."
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Enviar convite" })
    ).not.toBeInTheDocument()
    expect(mocks.listWorkspaceInvites).not.toHaveBeenCalled()
  })
})
