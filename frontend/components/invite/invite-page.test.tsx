import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InvitePage } from "@/components/invite/invite-page"

const mocks = vi.hoisted(() => ({
  acceptWorkspaceInvite: vi.fn(),
  getWorkspaceInvite: vi.fn(),
  replace: vi.fn(),
  authToken: null as string | null,
  user: null as null | {
    id: string
    email: string
    display_name: string
    created_at: string
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    loading: false,
    token: mocks.authToken,
    user: mocks.user,
  }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    acceptWorkspaceInvite: mocks.acceptWorkspaceInvite,
    getWorkspaceInvite: mocks.getWorkspaceInvite,
  },
}))

describe("InvitePage", () => {
  beforeEach(() => {
    mocks.acceptWorkspaceInvite.mockReset().mockResolvedValue({})
    mocks.getWorkspaceInvite.mockReset()
    mocks.replace.mockReset()
    mocks.authToken = null
    mocks.user = null
  })

  it("shows signup and login actions for a pending invite when logged out", async () => {
    mocks.getWorkspaceInvite.mockResolvedValue({
      workspace_name: "Product",
      email: "person@example.com",
      role: "editor",
      expires_at: "2026-07-15T12:00:00Z",
      status: "pending",
    })

    render(<InvitePage token="invite-token" />)

    expect(await screen.findByText("Product")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/signup?invite=invite-token"
    )
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login?invite=invite-token"
    )
  })

  it("accepts a pending invite when logged in", async () => {
    mocks.authToken = "secret-token"
    mocks.user = {
      id: "user-1",
      email: "person@example.com",
      display_name: "Person Example",
      created_at: "2026-07-08T12:00:00Z",
    }
    mocks.getWorkspaceInvite.mockResolvedValue({
      workspace_name: "Product",
      email: "person@example.com",
      role: "editor",
      expires_at: "2026-07-15T12:00:00Z",
      status: "pending",
    })

    render(<InvitePage token="invite-token" />)

    await screen.findByText("Product")
    await userEvent.click(
      screen.getByRole("button", { name: "Aceitar convite" })
    )

    await waitFor(() => {
      expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith(
        "secret-token",
        "invite-token"
      )
    })
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
  })

  it("shows expired invites without an action", async () => {
    mocks.getWorkspaceInvite.mockResolvedValue({
      workspace_name: "Product",
      email: "person@example.com",
      role: "viewer",
      expires_at: "2026-07-01T12:00:00Z",
      status: "expired",
    })

    render(<InvitePage token="invite-token" />)

    expect(await screen.findByText("Este convite expirou.")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Aceitar convite" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Criar conta" })
    ).not.toBeInTheDocument()
  })
})
