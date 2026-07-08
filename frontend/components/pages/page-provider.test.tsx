import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PageProvider, pagePath, usePages } from "./page-provider"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listPages: vi.fn(),
  applyOperation: vi.fn(),
  listTrash: vi.fn(),
  workspace: {
    activeWorkspace: { id: "ws-1", role: "owner" },
    activeWorkspaceId: "ws-1",
    loading: false,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ token: "secret-token" }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => mocks.workspace,
}))

vi.mock("@/lib/api", () => ({
  api: {
    listPages: (...args: unknown[]) => mocks.listPages(...args),
    applyOperation: (...args: unknown[]) => mocks.applyOperation(...args),
    listTrash: (...args: unknown[]) => mocks.listTrash(...args),
  },
}))

const PAGES = {
  root_page_id: "page-root",
  pages: [
    { id: "page-root", title: "Notas", parent_page_id: null },
    { id: "page-child", title: "Filha", parent_page_id: "page-root" },
  ],
}

function Probe() {
  const { currentPageId, rootPageId, canWrite, pages, createChildPage } =
    usePages()
  return (
    <div>
      <span data-testid="current">{currentPageId ?? "none"}</span>
      <span data-testid="root">{rootPageId ?? "none"}</span>
      <span data-testid="write">{String(canWrite)}</span>
      <span data-testid="count">{pages.length}</span>
      <button onClick={() => createChildPage("page-root")}>criar</button>
    </div>
  )
}

function renderProvider(pageId?: string) {
  return render(
    <PageProvider pageId={pageId}>
      <Probe />
    </PageProvider>
  )
}

describe("PageProvider", () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    mocks.applyOperation.mockReset().mockResolvedValue({ op_id: "x", seq: 1 })
    mocks.listTrash.mockReset().mockResolvedValue([])
    mocks.listPages.mockReset().mockResolvedValue(PAGES)
    mocks.workspace.activeWorkspace = { id: "ws-1", role: "owner" }
  })

  it("redirects /dashboard to the workspace root page", async () => {
    renderProvider()
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(pagePath("page-root"))
    )
    expect(screen.getByTestId("current")).toHaveTextContent("none")
  })

  it("selects a page that belongs to the workspace without redirecting", async () => {
    renderProvider("page-child")
    await waitFor(() =>
      expect(screen.getByTestId("current")).toHaveTextContent("page-child")
    )
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByTestId("count")).toHaveTextContent("2")
  })

  it("redirects to the root when the page is not in this workspace", async () => {
    renderProvider("page-from-another-workspace")
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(pagePath("page-root"))
    )
    expect(screen.getByTestId("current")).toHaveTextContent("none")
  })

  it("creates a child page as two insert ops and refreshes the tree", async () => {
    renderProvider("page-root")
    await waitFor(() => expect(screen.getByTestId("root")).toHaveTextContent("page-root"))
    mocks.listPages.mockClear()

    await userEvent.click(screen.getByText("criar"))

    await waitFor(() => expect(mocks.applyOperation).toHaveBeenCalledTimes(2))
    const [pageOp, paragraphOp] = mocks.applyOperation.mock.calls.map(
      ([, , operation]) => operation
    )
    expect(pageOp.type).toBe("insert_block")
    expect(pageOp.block.type).toBe("page")
    expect(pageOp.block.workspaceId).toBe("ws-1")
    expect(pageOp.parentId).toBe("page-root")
    expect(paragraphOp.block.type).toBe("paragraph")
    expect(paragraphOp.parentId).toBe(pageOp.block.id)
    expect(mocks.listPages).toHaveBeenCalled()
  })

  it("marks viewers as read-only", async () => {
    mocks.workspace.activeWorkspace = { id: "ws-1", role: "viewer" }
    renderProvider("page-root")
    await waitFor(() =>
      expect(screen.getByTestId("write")).toHaveTextContent("false")
    )
  })
})
