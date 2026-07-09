import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useWorkspace,
  WorkspaceProvider,
} from "@/components/workspace/workspace-provider"

const mocks = vi.hoisted(() => ({
  user: {
    id: "user-1",
    email: "israel@example.com",
    display_name: "Israel",
    created_at: "2026-07-08T12:00:00Z",
  },
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    token: "secret-token",
    user: mocks.user,
  }),
}))

vi.mock("@/lib/api", () => ({
  api: {
    listWorkspaces: mocks.listWorkspaces,
    createWorkspace: mocks.createWorkspace,
    deleteWorkspace: mocks.deleteWorkspace,
  },
}))

const workspaces = [
  {
    id: "workspace-1",
    name: "Product",
    role: "owner",
    created_at: "2026-07-08T12:00:00Z",
  },
  {
    id: "workspace-2",
    name: "Design",
    role: "viewer",
    created_at: "2026-07-08T12:00:00Z",
  },
] as const

function Probe() {
  const {
    activeWorkspace,
    createWorkspace,
    deleteWorkspace,
    loading,
    selectWorkspace,
    workspaces,
  } = useWorkspace()

  return (
    <div>
      <p>{loading ? "loading" : "ready"}</p>
      <p data-testid="count">{workspaces.length}</p>
      <p data-testid="active">{activeWorkspace?.id ?? "none"}</p>
      <button type="button" onClick={() => selectWorkspace("workspace-2")}>
        Select design
      </button>
      <button type="button" onClick={() => void createWorkspace("Sales")}>
        Create sales
      </button>
      <button type="button" onClick={() => void deleteWorkspace("workspace-1")}>
        Delete product
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <WorkspaceProvider>
      <Probe />
    </WorkspaceProvider>
  )
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.listWorkspaces.mockReset()
    mocks.createWorkspace.mockReset()
    mocks.deleteWorkspace.mockReset().mockResolvedValue(undefined)
  })

  it("loads workspaces and selects the first when no saved workspace exists", async () => {
    mocks.listWorkspaces.mockResolvedValue(workspaces)

    renderProvider()

    await screen.findByText("ready")
    expect(screen.getByTestId("count")).toHaveTextContent("2")
    expect(screen.getByTestId("active")).toHaveTextContent("workspace-1")
    expect(localStorage.getItem("reason_active_workspace:user-1")).toBe(
      "workspace-1"
    )
  })

  it("selects a saved workspace when it still exists", async () => {
    localStorage.setItem("reason_active_workspace:user-1", "workspace-2")
    mocks.listWorkspaces.mockResolvedValue(workspaces)

    renderProvider()

    await screen.findByText("ready")
    expect(screen.getByTestId("active")).toHaveTextContent("workspace-2")
  })

  it("falls back to the first workspace when the saved one no longer exists", async () => {
    localStorage.setItem("reason_active_workspace:user-1", "missing")
    mocks.listWorkspaces.mockResolvedValue(workspaces)

    renderProvider()

    await screen.findByText("ready")
    expect(screen.getByTestId("active")).toHaveTextContent("workspace-1")
  })

  it("creates a workspace and selects it", async () => {
    mocks.listWorkspaces.mockResolvedValue([workspaces[0]])
    mocks.createWorkspace.mockResolvedValue({
      id: "workspace-3",
      name: "Sales",
      created_at: "2026-07-08T12:00:00Z",
    })

    renderProvider()

    await screen.findByText("ready")
    await userEvent.click(screen.getByRole("button", { name: "Create sales" }))

    await waitFor(() => {
      expect(screen.getByTestId("active")).toHaveTextContent("workspace-3")
    })
    expect(localStorage.getItem("reason_active_workspace:user-1")).toBe(
      "workspace-3"
    )
  })

  it("deletes the active workspace and selects the next one", async () => {
    mocks.listWorkspaces.mockResolvedValue(workspaces)

    renderProvider()

    await screen.findByText("ready")
    await userEvent.click(screen.getByRole("button", { name: "Delete product" }))

    await waitFor(() => {
      expect(mocks.deleteWorkspace).toHaveBeenCalledWith(
        "secret-token",
        "workspace-1"
      )
    })
    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(screen.getByTestId("active")).toHaveTextContent("workspace-2")
    expect(localStorage.getItem("reason_active_workspace:user-1")).toBe(
      "workspace-2"
    )
  })
})
