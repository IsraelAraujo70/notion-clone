import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { PublicPage } from "./public-page"

const mocks = vi.hoisted(() => ({ getPublicPage: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getPublicPage: (...args: unknown[]) => mocks.getPublicPage(...args),
    },
  }
})

vi.mock("@/components/editor/BlockEditor", () => ({
  BlockEditor: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="public-editor" data-read-only={String(readOnly)} />
  ),
}))

const pageResponse = {
  page: {
    rootId: "page-1",
    blocks: [
      {
        id: "page-1",
        workspaceId: "ws-1",
        type: "page" as const,
        properties: { title: "Roadmap público", icon: "🧭" },
        content: ["paragraph-1"],
        parentId: null,
        trashedAt: null,
        trashedIndex: null,
      },
      {
        id: "paragraph-1",
        workspaceId: "ws-1",
        type: "paragraph" as const,
        properties: { text: "Próximo lançamento" },
        content: [],
        parentId: "page-1",
        trashedAt: null,
        trashedIndex: null,
      },
    ],
  },
}

describe("PublicPage", () => {
  beforeEach(() => {
    mocks.getPublicPage.mockReset().mockResolvedValue(pageResponse)
  })

  it("loads an anonymous page through a read-only editor", async () => {
    render(<PublicPage token="public-token" />)

    expect(await screen.findByText("Roadmap público")).toBeVisible()
    expect(screen.getByText("🧭")).toBeVisible()
    expect(screen.getByTestId("public-editor")).toHaveAttribute(
      "data-read-only",
      "true"
    )
    expect(mocks.getPublicPage).toHaveBeenCalledWith("public-token")
  })

  it("shows a clear not-found state for revoked or invalid links", async () => {
    mocks.getPublicPage.mockRejectedValue(
      new ApiError(404, "not_found", "Not found")
    )
    render(<PublicPage token="revoked-token" />)

    expect(await screen.findByText("Página não encontrada")).toBeVisible()
    expect(
      screen.getByText("Este link não existe ou deixou de ser público.")
    ).toBeVisible()
  })
})
