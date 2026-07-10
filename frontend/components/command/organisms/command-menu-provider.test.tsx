import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommandMenuProvider, useCommandMenu } from "./command-menu-provider"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(),
  search: vi.fn(),
  selectWorkspace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ logout: mocks.logout, token: "secret-token" }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({ selectWorkspace: mocks.selectWorkspace }),
}))

vi.mock("@/lib/api", () => ({
  api: { search: (...args: unknown[]) => mocks.search(...args) },
}))

function Trigger() {
  const { openMenu } = useCommandMenu()
  return <button onClick={openMenu}>Open commands</button>
}

describe("CommandMenuProvider", () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.logout.mockReset()
    mocks.search.mockReset().mockResolvedValue([])
    mocks.selectWorkspace.mockReset()
  })

  const pages = [
    { id: "page-root", title: "Notas", icon: "", parent_page_id: null },
    { id: "page-child", title: "", icon: "", parent_page_id: "page-root" },
  ]

  it("opens from keyboard and navigates to a real page", async () => {
    render(
      <CommandMenuProvider pages={pages}>
        <Trigger />
      </CommandMenuProvider>
    )

    await userEvent.keyboard("{Meta>}k{/Meta}")
    expect(
      screen.getByPlaceholderText("Buscar páginas e conteúdo...")
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText("Notas"))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/page-root")
  })

  it("shows untitled pages and routes to them", async () => {
    render(
      <CommandMenuProvider pages={pages}>
        <Trigger />
      </CommandMenuProvider>
    )

    await userEvent.click(screen.getByText("Open commands"))
    await userEvent.click(screen.getByText("Sem título"))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/pages/page-child")
  })

  it("logs out from the command palette", async () => {
    mocks.logout.mockResolvedValue(undefined)
    render(
      <CommandMenuProvider>
        <Trigger />
      </CommandMenuProvider>
    )

    await userEvent.click(screen.getByText("Open commands"))
    await userEvent.click(screen.getByText("Sair"))

    expect(mocks.logout).toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith("/")
  })

  it("debounces remote search and discards an older response", async () => {
    vi.useFakeTimers()
    let resolveFirst!: (value: unknown[]) => void
    let resolveSecond!: (value: unknown[]) => void
    mocks.search
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve
        })
      )

    render(
      <CommandMenuProvider pages={pages}>
        <Trigger />
      </CommandMenuProvider>
    )
    fireEvent.click(screen.getByText("Open commands"))
    const input = screen.getByPlaceholderText("Buscar páginas e conteúdo...")

    fireEvent.change(input, { target: { value: "ab" } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.change(input, { target: { value: "abc" } })
    await act(() => vi.advanceTimersByTimeAsync(200))

    await act(async () => {
      resolveSecond([
        {
          workspace_id: "ws-2",
          workspace_name: "Produto",
          page_id: "page-new",
          page_title: "Resultado novo",
          page_icon: "",
          block_id: "block-new",
          block_type: "paragraph",
          snippet: "abc",
          rank: 1,
        },
      ])
    })
    expect(screen.getByText("Resultado novo")).toBeInTheDocument()

    await act(async () => {
      resolveFirst([
        {
          workspace_id: "ws-1",
          workspace_name: "Antigo",
          page_id: "page-old",
          page_title: "Resultado antigo",
          page_icon: "",
          block_id: "block-old",
          block_type: "paragraph",
          snippet: "ab",
          rank: 1,
        },
      ])
    })
    expect(screen.queryByText("Resultado antigo")).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it("groups results by workspace and changes workspace before navigation", async () => {
    mocks.search.mockResolvedValue([
      {
        workspace_id: "ws-2",
        workspace_name: "Produto",
        page_id: "page-result",
        page_title: "Roadmap",
        page_icon: "🧭",
        block_id: "block-result",
        block_type: "paragraph",
        snippet: "<mark>Próximo lançamento</mark>",
        rank: 1,
      },
    ])
    render(
      <CommandMenuProvider pages={pages}>
        <Trigger />
      </CommandMenuProvider>
    )
    await userEvent.click(screen.getByText("Open commands"))
    await userEvent.type(
      screen.getByPlaceholderText("Buscar páginas e conteúdo..."),
      "roadmap"
    )

    await act(() => new Promise((resolve) => setTimeout(resolve, 220)))
    expect(await screen.findByText("Produto")).toBeInTheDocument()
    expect(
      screen.getByText("<mark>Próximo lançamento</mark>")
    ).toBeInTheDocument()
    expect(document.querySelector("mark")).toBeNull()
    await userEvent.click(screen.getByText("Roadmap"))

    expect(mocks.selectWorkspace).toHaveBeenCalledWith("ws-2")
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/pages/page-result?block=block-result"
    )
  })
})
