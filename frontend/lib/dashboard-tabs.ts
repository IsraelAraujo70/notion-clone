export const DASHBOARD_AI_PATH = "/dashboard/ai"
export const DASHBOARD_TABS_VERSION = 1

export type DashboardPageTab = {
  pageId: string
  path: string
  title?: string
  icon?: string | null
}

export type DashboardTabsState = {
  tabs: DashboardPageTab[]
  lastActivePath: string
}

type StoredDashboardTabs = DashboardTabsState & {
  version: typeof DASHBOARD_TABS_VERSION
}

export function dashboardTabsStorageKey(userId: string, workspaceId: string) {
  return `reason:dashboard-tabs:v${DASHBOARD_TABS_VERSION}:${userId}:${workspaceId}`
}

export function pageIdFromDashboardPath(path: string): string | null {
  const match = /^\/dashboard\/pages\/([^/?#]+)(?:[/?#]|$)/.exec(path)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function emptyDashboardTabsState(): DashboardTabsState {
  return { tabs: [], lastActivePath: DASHBOARD_AI_PATH }
}

export function parseDashboardTabs(value: string | null): DashboardTabsState {
  if (!value) return emptyDashboardTabsState()

  try {
    const parsed = JSON.parse(value) as Partial<StoredDashboardTabs>
    if (parsed.version !== DASHBOARD_TABS_VERSION || !Array.isArray(parsed.tabs)) {
      return emptyDashboardTabsState()
    }

    const seen = new Set<string>()
    const tabs = parsed.tabs.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return []
      const pageId = "pageId" in candidate ? candidate.pageId : null
      const path = "path" in candidate ? candidate.path : null
      if (
        typeof pageId !== "string" ||
        typeof path !== "string" ||
        pageIdFromDashboardPath(path) !== pageId ||
        seen.has(pageId)
      ) {
        return []
      }
      seen.add(pageId)
      return [
        {
          pageId,
          path,
          title:
            "title" in candidate && typeof candidate.title === "string"
              ? candidate.title
              : undefined,
          icon:
            "icon" in candidate &&
            (typeof candidate.icon === "string" || candidate.icon === null)
              ? candidate.icon
              : undefined,
        },
      ]
    })

    const lastActivePath =
      typeof parsed.lastActivePath === "string" &&
      (parsed.lastActivePath === DASHBOARD_AI_PATH ||
        tabs.some((tab) => tab.path === parsed.lastActivePath))
        ? parsed.lastActivePath
        : DASHBOARD_AI_PATH

    return { tabs, lastActivePath }
  } catch {
    return emptyDashboardTabsState()
  }
}

export function serializeDashboardTabs(state: DashboardTabsState) {
  return JSON.stringify({ version: DASHBOARD_TABS_VERSION, ...state })
}

export function openDashboardPageTab(
  state: DashboardTabsState,
  pageId: string,
  path: string,
  metadata: Pick<DashboardPageTab, "title" | "icon"> = {}
): DashboardTabsState {
  if (pageIdFromDashboardPath(path) !== pageId) return state
  const existing = state.tabs.findIndex((tab) => tab.pageId === pageId)
  const tabs = [...state.tabs]
  if (existing >= 0) {
    tabs[existing] = { ...tabs[existing], ...metadata, pageId, path }
  } else {
    tabs.push({ pageId, path, ...metadata })
  }
  return { tabs, lastActivePath: path }
}

export function activateDashboardPath(
  state: DashboardTabsState,
  path: string
): DashboardTabsState {
  if (path === DASHBOARD_AI_PATH) {
    return { ...state, lastActivePath: path }
  }
  const pageId = pageIdFromDashboardPath(path)
  return pageId ? openDashboardPageTab(state, pageId, path) : state
}

export function closeDashboardPageTab(
  state: DashboardTabsState,
  pageId: string,
  activePath: string
): { state: DashboardTabsState; nextPath: string | null } {
  const index = state.tabs.findIndex((tab) => tab.pageId === pageId)
  if (index < 0) return { state, nextPath: null }

  const closingActive = pageIdFromDashboardPath(activePath) === pageId
  const tabs = state.tabs.filter((tab) => tab.pageId !== pageId)
  if (!closingActive) {
    const lastActivePath =
      pageIdFromDashboardPath(state.lastActivePath) === pageId
        ? DASHBOARD_AI_PATH
        : state.lastActivePath
    return { state: { tabs, lastActivePath }, nextPath: null }
  }

  const nextPath = tabs[index]?.path ?? tabs[index - 1]?.path ?? DASHBOARD_AI_PATH
  return { state: { tabs, lastActivePath: nextPath }, nextPath }
}

export function reorderDashboardPageTabs(
  state: DashboardTabsState,
  draggedPageId: string,
  targetPageId: string
): DashboardTabsState {
  const from = state.tabs.findIndex((tab) => tab.pageId === draggedPageId)
  const to = state.tabs.findIndex((tab) => tab.pageId === targetPageId)
  if (from < 0 || to < 0 || from === to) return state

  const tabs = [...state.tabs]
  const [dragged] = tabs.splice(from, 1)
  tabs.splice(to, 0, dragged)
  return { ...state, tabs }
}

export function reconcileDashboardPageTabs(
  state: DashboardTabsState,
  validPageIds: ReadonlySet<string>,
  activePath: string
): { state: DashboardTabsState; nextPath: string | null } {
  let nextState = state
  let nextPath: string | null = null

  for (const tab of state.tabs) {
    if (validPageIds.has(tab.pageId)) continue
    const closed = closeDashboardPageTab(nextState, tab.pageId, activePath)
    nextState = closed.state
    nextPath ??= closed.nextPath
  }

  return { state: nextState, nextPath }
}
