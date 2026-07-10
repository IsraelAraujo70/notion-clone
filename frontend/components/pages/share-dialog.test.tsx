import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { ShareDialog } from "./share-dialog"

const mocks = vi.hoisted(() => ({
  getPublicLink: vi.fn(),
  createPublicLink: vi.fn(),
  revokePublicLink: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ token: "secret-token" }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({ activeWorkspaceId: "ws-1" }),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getPublicLink: (...args: unknown[]) => mocks.getPublicLink(...args),
      createPublicLink: (...args: unknown[]) => mocks.createPublicLink(...args),
      revokePublicLink: (...args: unknown[]) => mocks.revokePublicLink(...args),
    },
  }
})

const publicLink = {
  token: "public-token",
  url: "http://localhost:3000/share/public-token",
  created_at: "2026-07-10T12:00:00Z",
}

describe("ShareDialog", () => {
  beforeEach(() => {
    mocks.getPublicLink
      .mockReset()
      .mockRejectedValue(new ApiError(404, "not_found", "Not found"))
    mocks.createPublicLink.mockReset().mockResolvedValue(publicLink)
    mocks.revokePublicLink.mockReset().mockResolvedValue(undefined)
    mocks.writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    })
  })

  it("creates, copies, and revokes the active public link", async () => {
    render(<ShareDialog pageId="page-1" canWrite />)
    await userEvent.click(screen.getByRole("button", { name: "Compartilhar" }))
    expect(
      await screen.findByText("Esta página ainda é privada.")
    ).toBeVisible()

    await userEvent.click(
      screen.getByRole("button", { name: "Criar link público" })
    )
    expect(await screen.findByDisplayValue(publicLink.url)).toBeVisible()

    await userEvent.click(screen.getByRole("button", { name: "Copiar link" }))
    expect(mocks.writeText).toHaveBeenCalledWith(publicLink.url)

    await userEvent.click(screen.getByRole("button", { name: "Revogar link" }))
    await waitFor(() => expect(mocks.revokePublicLink).toHaveBeenCalled())
    expect(screen.getByText("Esta página ainda é privada.")).toBeVisible()
  })

  it("does not render sharing actions for viewers", () => {
    render(<ShareDialog pageId="page-1" canWrite={false} />)
    expect(screen.queryByRole("button", { name: "Compartilhar" })).toBeNull()
    expect(mocks.getPublicLink).not.toHaveBeenCalled()
  })
})
