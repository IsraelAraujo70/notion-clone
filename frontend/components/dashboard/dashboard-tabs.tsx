"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"
import { FileTextIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { usePages } from "@/components/pages/page-provider"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
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
  type DashboardPageTab,
  type DashboardTabsState,
} from "@/lib/dashboard-tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"

export const DASHBOARD_TAB_DRAG_MIME = "application/x-reason-dashboard-tab+json"

type OpenPageOptions = Pick<DashboardPageTab, "title" | "icon"> & {
  path?: string
  replace?: boolean
}

type DashboardTabsContextValue = {
  tabs: DashboardPageTab[]
  activePath: string
  isMobile: boolean
  openPage: (pageId: string, options?: OpenPageOptions) => void
  openPath: (path: string, options?: Omit<OpenPageOptions, "path">) => void
  openAi: () => void
  closePage: (pageId: string) => void
  reorderPage: (draggedPageId: string, targetPageId: string) => void
}

const DashboardTabsContext = createContext<DashboardTabsContextValue | null>(
  null
)

function performanceMark(name: string, detail?: Record<string, string>) {
  if (typeof performance === "undefined") return
  performance.clearMarks(name)
  performance.mark(name, { detail })
}

function focusDashboardPath(path: string) {
  if (typeof requestAnimationFrame === "undefined") return
  requestAnimationFrame(() => {
    const pageId = pageIdFromDashboardPath(path)
    const target = pageId
      ? Array.from(
          document.querySelectorAll<HTMLElement>("[data-dashboard-page-id]")
        ).find((element) => element.dataset.dashboardPageId === pageId)
      : document.querySelector<HTMLElement>('[data-dashboard-ai-tab="true"]')
    target?.focus()
  })
}

function currentDashboardPath(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function DashboardTabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activePath = currentDashboardPath(pathname, searchParams)
  const isMobile = useIsMobile()
  const { user, token } = useAuth()
  const { activeWorkspaceId } = useWorkspace()
  const { pages } = usePages()
  const [state, setState] = useState<DashboardTabsState>(
    emptyDashboardTabsState
  )
  const [hydratedKey, setHydratedKey] = useState<string | null>(null)
  const pendingNavigationRef = useRef<string | null>(null)
  const getActivePath = useEffectEvent(() => activePath)

  const storageKey =
    user && activeWorkspaceId
      ? dashboardTabsStorageKey(user.id, activeWorkspaceId)
      : null

  useEffect(() => {
    if (!storageKey) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setState(parseDashboardTabs(window.localStorage.getItem(storageKey)))
      setHydratedKey(storageKey)
    })
    return () => {
      cancelled = true
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || hydratedKey !== storageKey || isMobile) return
    window.localStorage.setItem(storageKey, serializeDashboardTabs(state))
  }, [hydratedKey, isMobile, state, storageKey])

  useEffect(() => {
    if (isMobile || !storageKey || hydratedKey !== storageKey) return

    const pendingPath = pendingNavigationRef.current
    if (pendingPath && activePath !== pendingPath) return
    if (pendingPath === activePath) pendingNavigationRef.current = null

    if (pathname === "/dashboard") {
      router.replace(state.lastActivePath)
      return
    }

    if (pathname === DASHBOARD_AI_PATH) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setState((current) =>
          current.lastActivePath === DASHBOARD_AI_PATH
            ? current
            : activateDashboardPath(current, DASHBOARD_AI_PATH)
        )
      })
      return () => {
        cancelled = true
      }
    }

    const pageId = pageIdFromDashboardPath(activePath)
    if (!pageId) return
    const page = pages.find((candidate) => candidate.id === pageId)
    let cancelled = false

    const applyTab = (metadata?: Pick<DashboardPageTab, "title" | "icon">) => {
      if (cancelled) return
      setState((current) => {
        const existing = current.tabs.find((tab) => tab.pageId === pageId)
        if (
          existing?.path === activePath &&
          existing.title === metadata?.title &&
          existing.icon === metadata?.icon &&
          current.lastActivePath === activePath
        ) {
          return current
        }
        return metadata
          ? openDashboardPageTab(current, pageId, activePath, metadata)
          : openDashboardPageTab(current, pageId, activePath)
      })
    }

    if (page) {
      queueMicrotask(() => applyTab({ title: page.title, icon: page.icon }))
    } else if (token && activeWorkspaceId) {
      void api
        .getPage(token, activeWorkspaceId, pageId)
        .then((response) => {
          const crumb =
            response.breadcrumbs.find((entry) => entry.id === pageId) ??
            response.breadcrumbs[0]
          applyTab(crumb ? { title: crumb.title, icon: crumb.icon } : undefined)
        })
        .catch(() => applyTab())
    }
    return () => {
      cancelled = true
    }
  }, [
    activePath,
    activeWorkspaceId,
    hydratedKey,
    isMobile,
    pages,
    pathname,
    router,
    state.lastActivePath,
    storageKey,
    token,
  ])

  useEffect(() => {
    if (
      isMobile ||
      !token ||
      !activeWorkspaceId ||
      !storageKey ||
      hydratedKey !== storageKey ||
      state.tabs.length === 0
    ) {
      return
    }

    const listedIds = new Set(pages.map((page) => page.id))
    const missing = state.tabs.filter((tab) => !listedIds.has(tab.pageId))
    if (missing.length === 0) return

    let cancelled = false
    void Promise.all(
      missing.map(async (tab) => {
        try {
          await api.getPage(token, activeWorkspaceId, tab.pageId)
          return tab.pageId
        } catch (error) {
          return error instanceof ApiError && [403, 404].includes(error.status)
            ? null
            : tab.pageId
        }
      })
    ).then((results) => {
      if (cancelled) return
      const validIds = new Set(listedIds)
      for (const result of results) {
        if (result) validIds.add(result)
      }
      const reconciled = reconcileDashboardPageTabs(
        state,
        validIds,
        getActivePath()
      )
      setState(reconciled.state)
      if (reconciled.nextPath) {
        pendingNavigationRef.current = reconciled.nextPath
        router.replace(reconciled.nextPath)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    activeWorkspaceId,
    hydratedKey,
    isMobile,
    pages,
    router,
    state,
    storageKey,
    token,
  ])

  const openPage = useCallback(
    (pageId: string, options: OpenPageOptions = {}) => {
      const path = options.path ?? `/dashboard/pages/${pageId}`
      if (isMobile) {
        if (options.replace) router.replace(path)
        else router.push(path)
        return
      }
      performanceMark("reason:tab-open-start", { pageId, path })
      pendingNavigationRef.current = path
      setState((current) =>
        openDashboardPageTab(current, pageId, path, options)
      )
      if (options.replace) router.replace(path)
      else router.push(path)
    },
    [isMobile, router]
  )

  const openPath = useCallback(
    (path: string, options: Omit<OpenPageOptions, "path"> = {}) => {
      const pageId = pageIdFromDashboardPath(path)
      if (pageId) openPage(pageId, { ...options, path })
      else if (path === DASHBOARD_AI_PATH) {
        performanceMark("reason:tab-open-ai")
        pendingNavigationRef.current = path
        setState((current) => activateDashboardPath(current, path))
        router.push(path)
      }
    },
    [openPage, router]
  )

  const closePage = useCallback(
    (pageId: string) => {
      if (isMobile) return
      const closed = closeDashboardPageTab(state, pageId, activePath)
      const focusPath = closed.nextPath ?? activePath
      performanceMark("reason:tab-close", { pageId, fallbackPath: focusPath })
      setState(closed.state)
      if (closed.nextPath) {
        pendingNavigationRef.current = closed.nextPath
        router.push(closed.nextPath)
      }
      focusDashboardPath(focusPath)
    },
    [activePath, isMobile, router, state]
  )

  const reorderPage = useCallback(
    (draggedPageId: string, targetPageId: string) => {
      if (isMobile) return
      setState((current) =>
        reorderDashboardPageTabs(current, draggedPageId, targetPageId)
      )
      performanceMark("reason:tab-reorder", {
        draggedPageId,
        targetPageId,
      })
    },
    [isMobile]
  )

  const value = useMemo<DashboardTabsContextValue>(
    () => ({
      tabs: state.tabs,
      activePath,
      isMobile,
      openPage,
      openPath,
      openAi: () => openPath(DASHBOARD_AI_PATH),
      closePage,
      reorderPage,
    }),
    [
      activePath,
      closePage,
      isMobile,
      openPage,
      openPath,
      reorderPage,
      state.tabs,
    ]
  )

  return (
    <DashboardTabsContext.Provider value={value}>
      {children}
    </DashboardTabsContext.Provider>
  )
}

export function useDashboardTabs() {
  const context = useContext(DashboardTabsContext)
  if (!context) {
    throw new Error("useDashboardTabs must be used inside DashboardTabsProvider")
  }
  return context
}

function tabTitle(tab: DashboardPageTab, untitled: string) {
  return tab.title?.trim() || untitled
}

const tabWrapperBase =
  "group/tab relative flex h-7 shrink-0 items-center rounded-md transition-colors duration-150"
const tabWrapperActive = "bg-muted"
const tabTriggerBase =
  "h-full min-w-0 flex-1 justify-start gap-2 rounded-md bg-transparent px-2.5 text-[13px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:rounded-md data-active:bg-transparent data-active:text-foreground data-active:font-medium data-active:shadow-none after:hidden dark:data-active:bg-transparent dark:hover:text-foreground"

function PageTab({ tab }: { tab: DashboardPageTab }) {
  const { activePath, closePage, reorderPage } = useDashboardTabs()
  const { t } = useI18n()
  const title = tabTitle(tab, t("Untitled"))
  const active = pageIdFromDashboardPath(activePath) === tab.pageId

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(
      DASHBOARD_TAB_DRAG_MIME,
      JSON.stringify({ pageId: tab.pageId })
    )
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(DASHBOARD_TAB_DRAG_MIME)) return
    event.preventDefault()
    try {
      const dragged = JSON.parse(
        event.dataTransfer.getData(DASHBOARD_TAB_DRAG_MIME)
      ) as { pageId?: unknown }
      if (typeof dragged.pageId === "string") {
        reorderPage(dragged.pageId, tab.pageId)
      }
    } catch {
      // Ignore malformed drag payloads from outside the application.
    }
  }

  return (
    <div
      className={cn(
        tabWrapperBase,
        "min-w-28 max-w-52",
        active ? tabWrapperActive : "hover:bg-muted/50"
      )}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DASHBOARD_TAB_DRAG_MIME)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = "move"
        }
      }}
      onDrop={onDrop}
      data-cy={`dashboard-tab-${tab.pageId}`}
      data-testid={`dashboard-tab-${tab.pageId}`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <TabsTrigger
            value={tab.path}
            className={tabTriggerBase}
            data-dashboard-page-id={tab.pageId}
          >
            <span aria-hidden="true" className="shrink-0 text-sm leading-none">
              {tab.icon || <FileTextIcon className="size-3.5" />}
            </span>
            <span className="truncate">{title}</span>
          </TabsTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {title}
        </TooltipContent>
      </Tooltip>
      <button
        type="button"
        className="mr-1.5 grid size-5 shrink-0 self-center place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
        aria-label={t("Close {title}", { title })}
        onClick={(event) => {
          event.stopPropagation()
          closePage(tab.pageId)
        }}
        data-cy={`dashboard-tab-close-${tab.pageId}`}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  )
}

function AiTab({ active }: { active: boolean }) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        tabWrapperBase,
        active ? tabWrapperActive : "hover:bg-muted/50"
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <TabsTrigger
            value={DASHBOARD_AI_PATH}
            className={cn(tabTriggerBase, "w-auto flex-none gap-1.5")}
            aria-label={t("Reason AI")}
            data-dashboard-ai-tab="true"
            data-cy="dashboard-tab-ai"
          >
            <SparklesIcon className="size-3.5 text-manila-strong" />
            <span>{t("AI")}</span>
          </TabsTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {t("Reason AI")}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function NewPageTabButton() {
  const { openPage } = useDashboardTabs()
  const { canWrite, createTopLevelPage } = usePages()
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)

  if (!canWrite) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label={t("New page")}
          disabled={creating}
          onClick={async () => {
            setCreating(true)
            try {
              openPage(await createTopLevelPage())
            } finally {
              setCreating(false)
            }
          }}
          data-cy="dashboard-tab-new"
        >
          <PlusIcon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {t("New page")}
      </TooltipContent>
    </Tooltip>
  )
}

export function DashboardTabsRail() {
  const { activePath, isMobile, openPath, tabs } = useDashboardTabs()
  const { t } = useI18n()
  if (isMobile) return null

  const value =
    activePath === DASHBOARD_AI_PATH
      ? DASHBOARD_AI_PATH
      : tabs.find((tab) => tab.pageId === pageIdFromDashboardPath(activePath))
          ?.path ?? DASHBOARD_AI_PATH

  return (
    <Tabs
      value={value}
      onValueChange={openPath}
      className="h-10 gap-0 border-b border-border bg-background"
    >
      <TabsList
        variant="line"
        aria-label={t("Open pages")}
        className="h-full w-full items-center justify-start gap-1 overflow-x-auto rounded-none px-2 py-0 [scrollbar-width:thin]"
      >
        <AiTab active={activePath === DASHBOARD_AI_PATH} />
        {tabs.map((tab) => (
          <PageTab key={tab.pageId} tab={tab} />
        ))}
        <NewPageTabButton />
      </TabsList>
    </Tabs>
  )
}
