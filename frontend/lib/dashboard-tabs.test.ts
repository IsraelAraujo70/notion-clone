import { describe, expect, it } from "vitest"

import {
  DASHBOARD_AI_PATH,
  activateDashboardPath,
  closeDashboardPageTab,
  dashboardTabsStorageKey,
  emptyDashboardTabsState,
  openDashboardPageTab,
  pageIdFromDashboardPath,
  parseDashboardTabs,
  reconcileDashboardPageTabs,
  reorderDashboardPageTabs,
  serializeDashboardTabs,
} from "./dashboard-tabs"

describe("dashboard tabs", () => {
  it("scopes persisted state by user and workspace", () => {
    expect(dashboardTabsStorageKey("user-1", "workspace-1")).toBe(
      "reason:dashboard-tabs:v1:user-1:workspace-1"
    )
    expect(dashboardTabsStorageKey("user-1", "workspace-2")).not.toBe(
      dashboardTabsStorageKey("user-2", "workspace-1")
    )
  })

  it("parses page ids and preserves block deep links", () => {
    const path = "/dashboard/pages/page-1?block=block-9"
    expect(pageIdFromDashboardPath(path)).toBe("page-1")
    expect(pageIdFromDashboardPath(DASHBOARD_AI_PATH)).toBeNull()

    const state = openDashboardPageTab(
      emptyDashboardTabsState(),
      "page-1",
      path
    )
    expect(state.tabs).toEqual([{ pageId: "page-1", path }])
    expect(state.lastActivePath).toBe(path)
  })

  it("opens a page once and updates its latest destination", () => {
    const initial = openDashboardPageTab(
      emptyDashboardTabsState(),
      "page-1",
      "/dashboard/pages/page-1",
      { title: "First", icon: "📄" }
    )
    const updated = openDashboardPageTab(
      initial,
      "page-1",
      "/dashboard/pages/page-1?block=block-2",
      { title: "Renamed" }
    )

    expect(updated.tabs).toEqual([
      {
        pageId: "page-1",
        path: "/dashboard/pages/page-1?block=block-2",
        title: "Renamed",
        icon: "📄",
      },
    ])
  })

  it("closes the active page to the right, left, then AI", () => {
    let state = emptyDashboardTabsState()
    state = openDashboardPageTab(state, "a", "/dashboard/pages/a")
    state = openDashboardPageTab(state, "b", "/dashboard/pages/b")
    state = openDashboardPageTab(state, "c", "/dashboard/pages/c")

    const middle = closeDashboardPageTab(state, "b", "/dashboard/pages/b")
    expect(middle.nextPath).toBe("/dashboard/pages/c")

    const last = closeDashboardPageTab(
      middle.state,
      "c",
      "/dashboard/pages/c"
    )
    expect(last.nextPath).toBe("/dashboard/pages/a")

    const only = closeDashboardPageTab(
      last.state,
      "a",
      "/dashboard/pages/a"
    )
    expect(only.nextPath).toBe(DASHBOARD_AI_PATH)
    expect(only.state.tabs).toEqual([])
  })

  it("does not navigate when closing an inactive page", () => {
    let state = emptyDashboardTabsState()
    state = openDashboardPageTab(state, "a", "/dashboard/pages/a")
    state = openDashboardPageTab(state, "b", "/dashboard/pages/b")

    const closed = closeDashboardPageTab(state, "a", "/dashboard/pages/b")
    expect(closed.nextPath).toBeNull()
    expect(closed.state.tabs.map((tab) => tab.pageId)).toEqual(["b"])
  })

  it("reorders tabs without changing their routes", () => {
    let state = emptyDashboardTabsState()
    for (const id of ["a", "b", "c"]) {
      state = openDashboardPageTab(state, id, `/dashboard/pages/${id}`)
    }

    const reordered = reorderDashboardPageTabs(state, "c", "a")
    expect(reordered.tabs.map((tab) => tab.pageId)).toEqual(["c", "a", "b"])
    expect(reordered.tabs.map((tab) => tab.path)).toEqual([
      "/dashboard/pages/c",
      "/dashboard/pages/a",
      "/dashboard/pages/b",
    ])
  })

  it("reconciles removed pages and selects a deterministic fallback", () => {
    let state = emptyDashboardTabsState()
    state = openDashboardPageTab(state, "a", "/dashboard/pages/a")
    state = openDashboardPageTab(state, "b", "/dashboard/pages/b")

    const reconciled = reconcileDashboardPageTabs(
      state,
      new Set(["a"]),
      "/dashboard/pages/b"
    )
    expect(reconciled.state.tabs.map((tab) => tab.pageId)).toEqual(["a"])
    expect(reconciled.nextPath).toBe("/dashboard/pages/a")
  })

  it("round-trips valid state and rejects corrupt or old payloads", () => {
    const state = activateDashboardPath(
      openDashboardPageTab(
        emptyDashboardTabsState(),
        "a",
        "/dashboard/pages/a",
        { title: "A" }
      ),
      DASHBOARD_AI_PATH
    )
    expect(parseDashboardTabs(serializeDashboardTabs(state))).toEqual(state)
    expect(parseDashboardTabs("not-json")).toEqual(emptyDashboardTabsState())
    expect(parseDashboardTabs('{"version":0,"tabs":[]}')).toEqual(
      emptyDashboardTabsState()
    )
  })

  it("filters duplicate and mismatched entries from storage", () => {
    const parsed = parseDashboardTabs(
      JSON.stringify({
        version: 1,
        lastActivePath: "/dashboard/pages/a",
        tabs: [
          { pageId: "a", path: "/dashboard/pages/a" },
          { pageId: "a", path: "/dashboard/pages/a?block=2" },
          { pageId: "b", path: "/dashboard/pages/c" },
        ],
      })
    )
    expect(parsed.tabs).toEqual([{ pageId: "a", path: "/dashboard/pages/a" }])
  })
})
