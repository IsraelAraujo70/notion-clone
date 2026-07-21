import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DASHBOARD_TAB_DRAG_MIME,
  DashboardTabsProvider,
  DashboardTabsRail,
} from "./dashboard-tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  dashboardTabsStorageKey,
  serializeDashboardTabs,
} from "@/lib/dashboard-tabs"

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard/pages/b",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  mobile: false,
  getPage: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mocks.mobile,
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, token: "token" }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({ activeWorkspaceId: "workspace-1" }),
}))

vi.mock("@/components/pages/page-provider", () => ({
  usePages: () => ({
    pages: [
      { id: "a", title: "Alpha", icon: "", parent_page_id: null },
      { id: "b", title: "Beta", icon: "🅱️", parent_page_id: null },
      { id: "c", title: "Gamma", icon: "", parent_page_id: null },
    ],
  }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number) {
      super("API error")
    }
  },
  api: { getPage: (...args: unknown[]) => mocks.getPage(...args) },
}))

class DataTransferStub {
  effectAllowed = "none"
  dropEffect = "none"
  private data = new Map<string, string>()

  get types() {
    return [...this.data.keys()]
  }

  setData(type: string, value: string) {
    this.data.set(type, value)
  }

  getData(type: string) {
    return this.data.get(type) ?? ""
  }
}

function renderTabs() {
  return render(
    <TooltipProvider>
      <DashboardTabsProvider>
        <DashboardTabsRail />
      </DashboardTabsProvider>
    </TooltipProvider>
  )
}

describe("DashboardTabs", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard/pages/b"
    mocks.search = ""
    mocks.mobile = false
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.getPage.mockReset()
    mocks.getPage.mockResolvedValue({})
    localStorage.clear()
    localStorage.setItem(
      dashboardTabsStorageKey("user-1", "workspace-1"),
      serializeDashboardTabs({
        tabs: [
          { pageId: "a", path: "/dashboard/pages/a", title: "Alpha" },
          { pageId: "b", path: "/dashboard/pages/b", title: "Beta" },
          { pageId: "c", path: "/dashboard/pages/c", title: "Gamma" },
        ],
        lastActivePath: "/dashboard/pages/b",
      })
    )
  })

  it("restores persisted tabs and closes the active tab to the right", async () => {
    renderTabs()

    expect(await screen.findByRole("tab", { name: "Beta" })).toBeVisible()
    await userEvent.click(
      screen.getByRole("button", { name: "Close Beta" })
    )

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/c")
    expect(screen.queryByRole("tab", { name: "Beta" })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus()
    )
  })

  it("activates page tabs through keyboard navigation", async () => {
    renderTabs()

    const beta = await screen.findByRole("tab", { name: "Beta" })
    beta.focus()
    await userEvent.keyboard("{ArrowLeft}")

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/a")
  })

  it("restores the last active tab from the desktop dashboard root", async () => {
    mocks.pathname = "/dashboard"
    renderTabs()

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/pages/b")
    )
  })

  it("activates a tab through the shared navigation intent", async () => {
    renderTabs()

    await userEvent.click(await screen.findByRole("tab", { name: "Alpha" }))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/a")
  })

  it("reorders page tabs with the dedicated drag payload", async () => {
    renderTabs()
    const alpha = await screen.findByTestId("dashboard-tab-a")
    const gamma = screen.getByTestId("dashboard-tab-c")
    const transfer = new DataTransferStub()

    fireEvent.dragStart(gamma, { dataTransfer: transfer })
    expect(transfer.types).toContain(DASHBOARD_TAB_DRAG_MIME)
    fireEvent.dragOver(alpha, { dataTransfer: transfer })
    fireEvent.drop(alpha, { dataTransfer: transfer })

    await waitFor(() => {
      const tabs = screen.getAllByRole("tab").map(
        (tab) =>
          tab.getAttribute("aria-label") ??
          tab.querySelector(".truncate")?.textContent
      )
      expect(tabs).toEqual(["Reason AI", "Gamma", "Alpha", "Beta"])
    })
  })

  it("does not mount the tab rail on mobile", () => {
    mocks.mobile = true
    renderTabs()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })
})
