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
    { id: "page-root", title: "Notas", icon: "", parent_page_id: null },
    { id: "page-child", title: "Filha", icon: "🚀", parent_page_id: "page-root" },
  ],
}

function Probe() {
  const {
    currentPageId,
    rootPageId,
    canWrite,
    pages,
    createChildPage,
    renamePage,
    setPageIcon,
    deletePage,
  } = usePages()
  return (
    <div>
      <span data-testid="current">{currentPageId ?? "none"}</span>
      <span data-testid="root">{rootPageId ?? "none"}</span>
      <span data-testid="write">{String(canWrite)}</span>
      <span data-testid="count">{pages.length}</span>
      <button onClick={() => createChildPage("page-root")}>criar</button>
      <button onClick={() => renamePage("page-child", "Nova")}>renomear</button>
      <button onClick={() => setPageIcon("page-child", "🚀")}>icone</button>
      <button onClick={() => setPageIcon("page-child", null)}>sem-icone</button>
      <button onClick={() => deletePage("page-child")}>apagar</button>
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

  it("renames a page with one update_block on the page title", async () => {
    renderProvider("page-root")
    await waitFor(() => expect(screen.getByTestId("root")).toHaveTextContent("page-root"))
    mocks.listPages.mockClear()

    await userEvent.click(screen.getByText("renomear"))

    await waitFor(() => expect(mocks.applyOperation).toHaveBeenCalledTimes(1))
    const [, , operation] = mocks.applyOperation.mock.calls[0]
    expect(operation).toMatchObject({
      type: "update_block",
      blockId: "page-child",
      properties: { title: "Nova" },
    })
    expect(mocks.listPages).toHaveBeenCalled()
  })

  it("sets and clears the page icon; null removes the property", async () => {
    renderProvider("page-root")
    await waitFor(() => expect(screen.getByTestId("root")).toHaveTextContent("page-root"))

    await userEvent.click(screen.getByText("icone"))
    await userEvent.click(screen.getByText("sem-icone"))

    await waitFor(() => expect(mocks.applyOperation).toHaveBeenCalledTimes(2))
    const [set, clear] = mocks.applyOperation.mock.calls.map(([, , op]) => op)
    expect(set.properties).toEqual({ icon: "🚀" })
    expect(clear.properties).toEqual({ icon: null })
  })

  it("deletes a page with delete_block and refreshes the tree", async () => {
    renderProvider("page-root")
    await waitFor(() => expect(screen.getByTestId("root")).toHaveTextContent("page-root"))
    mocks.listPages.mockClear()

    await userEvent.click(screen.getByText("apagar"))

    await waitFor(() => expect(mocks.applyOperation).toHaveBeenCalledTimes(1))
    const [, , operation] = mocks.applyOperation.mock.calls[0]
    expect(operation).toMatchObject({ type: "delete_block", blockId: "page-child" })
    expect(mocks.listPages).toHaveBeenCalled()
  })
})
