import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NavUser } from "@/components/nav-user"
import { SidebarProvider } from "@/components/ui/sidebar"

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    logout: mocks.logout,
    user: {
      id: "user-1",
      email: "israel@example.com",
      display_name: "Israel Oliveira",
      created_at: "2026-07-08T12:00:00Z",
    },
  }),
}))

vi.mock("@/components/workspace/workspace-switcher", () => ({
  WorkspaceSwitcher: ({
    onCreateWorkspace,
  }: {
    onCreateWorkspace: () => void
  }) => (
    <div>
      <p>Workspaces</p>
      <button type="button">Product</button>
      <button type="button">Design</button>
      <button type="button" onClick={onCreateWorkspace}>
        Create workspace
      </button>
    </div>
  ),
}))

vi.mock("@/components/settings/settings-dialog", () => ({
  SettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Settings</div> : null,
}))

vi.mock("@/components/workspace/create-workspace-dialog", () => ({
  CreateWorkspaceDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Create workspace dialog</div> : null,
}))

describe("NavUser", () => {
  beforeEach(() => {
    mocks.logout.mockReset()
    mocks.replace.mockReset()
  })

  it("shows workspaces and opens settings", async () => {
    render(
      <SidebarProvider>
        <NavUser />
      </SidebarProvider>
    )

    await userEvent.click(screen.getByRole("button", { name: /israel/i }))

    expect(screen.getByText("Workspaces")).toBeInTheDocument()
    expect(screen.getByText("Product")).toBeInTheDocument()
    expect(screen.getByText("Design")).toBeInTheDocument()

    await userEvent.click(screen.getByText("Settings"))
    expect(screen.getByRole("dialog")).toHaveTextContent("Settings")
  })

  it("opens create workspace and logs out", async () => {
    mocks.logout.mockResolvedValue(undefined)
    render(
      <SidebarProvider>
        <NavUser />
      </SidebarProvider>
    )

    await userEvent.click(screen.getByRole("button", { name: /israel/i }))
    await userEvent.click(screen.getByText("Create workspace"))
    expect(screen.getByText("Create workspace dialog")).toBeInTheDocument()

    await userEvent.click(screen.getByText("Log out"))

    expect(mocks.logout).toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith("/")
  })
})
