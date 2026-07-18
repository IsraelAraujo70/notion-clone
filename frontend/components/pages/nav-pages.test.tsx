import { act, fireEvent, render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NavPages, buildPageTree } from "@/components/pages/nav-pages"
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { PageSummary } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pages: [] as PageSummary[],
  movePageToWorkspace: vi.fn(),
  startPageDrag: vi.fn(),
  endPageDrag: vi.fn(),
  pageDrag: null as PageSummary | null,
  canWrite: false,
  workspaces: [{ id: "ws-1", name: "Origem", role: "owner" }],
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock("@/components/pages/page-provider", () => ({
  PAGE_DRAG_MIME: "application/x-reason-page+json",
  pagePath: (pageId: string) => `/dashboard/pages/${pageId}`,
  usePages: () => ({
    pages: mocks.pages,
    loading: false,
    canWrite: mocks.canWrite,
    containerPageId: "workspace-root",
    currentPageId: null,
    createTopLevelPage: vi.fn(),
    createChildPage: vi.fn(),
    deletePage: vi.fn(),
    renamePage: vi.fn(),
    movePageToWorkspace: mocks.movePageToWorkspace,
    startPageDrag: mocks.startPageDrag,
    endPageDrag: mocks.endPageDrag,
    pageDrag: mocks.pageDrag,
  }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: "ws-1", name: "Origem", role: "owner" },
    activeWorkspaceId: "ws-1",
    workspaces: mocks.workspaces,
  }),
}))

function page(
  id: string,
  parentPageId: string | null,
  title = id
): PageSummary {
  return {
    id,
    title,
    icon: "📄",
    parent_page_id: parentPageId,
  }
}

function renderNavPages({ collapsed = false } = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={!collapsed}>
        <Sidebar collapsible="icon">
          <NavPages />
        </Sidebar>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function getByDataCy(value: string) {
  const element = document.querySelector<HTMLElement>(`[data-cy="${value}"]`)
  if (!element) {
    throw new Error(`Missing element with data-cy=${value}`)
  }
  return element
}

describe("NavPages", () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.movePageToWorkspace.mockReset().mockResolvedValue(undefined)
    mocks.startPageDrag.mockReset()
    mocks.endPageDrag.mockReset()
    mocks.pageDrag = null
    mocks.pages = []
    mocks.canWrite = false
    mocks.workspaces = [{ id: "ws-1", name: "Origem", role: "owner" }]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("builds roots when an old page points to a missing parent", () => {
    const tree = buildPageTree([
      page("orphan", "missing-parent"),
      page("root", null),
    ])

    expect(tree.map((node) => node.id)).toEqual(["orphan", "root"])
  })

  it("uses one leading slot for emoji and expand control", async () => {
    mocks.pages = [page("root", null, "Planejamento"), page("child", "root")]
    const user = userEvent.setup()
    renderNavPages()

    const toggle = getByDataCy("nav-page-toggle-root")
    const emoji = toggle.querySelector("span")

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(getByDataCy("nav-page-root")).toHaveStyle({
      paddingInlineStart: "36px",
    })
    expect(emoji).toHaveClass("group-hover/page-tree-item:hidden")
    expect(toggle.querySelector("svg")).toHaveClass(
      "group-hover/page-tree-item:block"
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(
      document.querySelector('[data-cy="nav-page-title-child"]')
    ).toBeNull()
  })

  it("shows only top-level page emojis when the sidebar is collapsed", () => {
    mocks.pages = [
      { ...page("parent", null, "Planejamento"), icon: "📌" },
      { ...page("child", "parent", "Detalhes"), icon: "📝" },
      { ...page("leaf", null, "Referências"), icon: "📚" },
    ]
    mocks.canWrite = true
    renderNavPages({ collapsed: true })

    expect(
      document.querySelector('[data-slot="sidebar"][data-state]')
    ).toHaveAttribute("data-state", "collapsed")
    expect(getByDataCy("nav-page-leading-parent")).toHaveTextContent("📌")
    expect(getByDataCy("nav-page-leading-parent")).toHaveClass(
      "hidden",
      "group-data-[collapsible=icon]:flex"
    )
    expect(getByDataCy("nav-page-leading-leaf")).toHaveTextContent("📚")
    expect(getByDataCy("nav-page-title-parent")).toHaveClass(
      "group-data-[collapsible=icon]:hidden"
    )
    expect(getByDataCy("nav-page-title-leaf")).toHaveClass(
      "group-data-[collapsible=icon]:hidden"
    )
    expect(getByDataCy("nav-page-parent")).toHaveAttribute(
      "aria-label",
      "Planejamento"
    )
    expect(getByDataCy("nav-page-parent")).toHaveAttribute(
      "title",
      "Planejamento"
    )
    expect(getByDataCy("nav-page-toggle-parent")).toHaveClass(
      "group-data-[collapsible=icon]:hidden"
    )
    expect(getByDataCy("nav-page-plus-parent")).toHaveClass(
      "group-data-[collapsible=icon]:hidden"
    )
    expect(getByDataCy("nav-page-leading-child").closest("ul")).toHaveClass(
      "group-data-[collapsible=icon]:hidden"
    )
  })

  it("caps recursive indentation at four levels and preserves the full title", () => {
    const longTitle = "Título da página no oitavo nível sem corte no tooltip"
    mocks.pages = Array.from({ length: 9 }, (_, index) =>
      page(
        `page-${index}`,
        index === 0 ? null : `page-${index - 1}`,
        index === 8 ? longTitle : `Página ${index}`
      )
    )
    renderNavPages()

    const deepTitle = getByDataCy("nav-page-title-page-8")
    const rowButton = deepTitle.closest("a")

    expect(rowButton).toHaveStyle({ paddingInlineStart: "56px" })
    expect(deepTitle).toHaveClass("min-w-24", "flex-1", "truncate")
    expect(deepTitle).toHaveAttribute("title", longTitle)
    expect(deepTitle.closest("a")).toHaveAttribute("aria-label", longTitle)
  })

  it("offers owner workspaces as transfer destinations", async () => {
    mocks.pages = [page("root", null, "Planejamento")]
    mocks.canWrite = true
    mocks.workspaces = [
      { id: "ws-1", name: "Origem", role: "owner" },
      { id: "ws-2", name: "Destino", role: "owner" },
      { id: "ws-3", name: "Somente leitura", role: "viewer" },
    ]
    const user = userEvent.setup()
    renderNavPages()

    await user.pointer({
      keys: "[MouseRight]",
      target: getByDataCy("nav-page-root"),
    })
    await user.click(getByDataCy("nav-page-move-workspace"))

    const select = getByDataCy("move-workspace-select")
    expect(select).toHaveValue("ws-2")
    expect(select).not.toHaveTextContent("Somente leitura")
    await user.click(getByDataCy("move-workspace-submit"))
    expect(mocks.movePageToWorkspace).toHaveBeenCalledWith("root", "ws-2")
  })

  it("starts a page drag and opens a valid destination after hovering", () => {
    vi.useFakeTimers()
    mocks.pages = [
      page("source", null, "Origem"),
      page("target", null, "Destino"),
    ]
    mocks.canWrite = true
    mocks.pageDrag = mocks.pages[0]
    renderNavPages()
    const source = getByDataCy("nav-page-source")
    const target = getByDataCy("nav-page-target")
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["application/x-reason-page+json"],
      setData: vi.fn(),
    }

    fireEvent.dragStart(source, { dataTransfer })
    expect(mocks.startPageDrag).toHaveBeenCalledWith({
      id: "source",
      title: "Origem",
      icon: "📄",
    })
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "application/x-reason-page+json",
      expect.any(String)
    )

    fireEvent.dragOver(target, { dataTransfer })
    act(() => vi.advanceTimersByTime(599))
    expect(mocks.push).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/target")
  })

  it("does not open a descendant because moving into it would create a cycle", () => {
    vi.useFakeTimers()
    mocks.pages = [page("source", null), page("child", "source")]
    mocks.canWrite = true
    mocks.pageDrag = mocks.pages[0]
    renderNavPages()

    const target = getByDataCy("nav-page-child")
    expect(target).not.toHaveAttribute("data-page-drop-target")
    fireEvent.dragOver(target, {
      dataTransfer: {
        types: ["application/x-reason-page+json"],
        dropEffect: "none",
      },
    })
    act(() => vi.advanceTimersByTime(600))

    expect(mocks.push).not.toHaveBeenCalled()
  })
})
