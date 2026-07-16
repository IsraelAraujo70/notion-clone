import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LoginForm } from "./login-form"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  acceptWorkspaceInvite: vi.fn(),
  requestPasswordReset: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ login: mocks.login }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    acceptWorkspaceInvite: mocks.acceptWorkspaceInvite,
    requestPasswordReset: mocks.requestPasswordReset,
  },
}))

describe("LoginForm", () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    mocks.login.mockReset()
    mocks.acceptWorkspaceInvite.mockReset()
    mocks.requestPasswordReset.mockReset()
  })

  it("logs in and routes to the dashboard", async () => {
    mocks.login.mockResolvedValue({
      token: "secret-token",
      user: {
        id: "user-1",
        email: "israel@example.com",
        display_name: "Israel",
        created_at: "2026-07-08T12:00:00Z",
      },
    })
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "Password123!")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(mocks.login).toHaveBeenCalledWith({
      email: "israel@example.com",
      password: "Password123!",
    })
    expect(mocks.acceptWorkspaceInvite).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
  })

  it("accepts an invite after login", async () => {
    mocks.login.mockResolvedValue({
      token: "secret-token",
      user: {
        id: "user-1",
        email: "israel@example.com",
        display_name: "Israel",
        created_at: "2026-07-08T12:00:00Z",
      },
    })
    mocks.acceptWorkspaceInvite.mockResolvedValue({})
    render(<LoginForm inviteToken="invite-token" />)

    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "Password123!")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith(
      "secret-token",
      "invite-token"
    )
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
  })

  it("switches to forgot-password mode and sends a reset request", async () => {
    mocks.requestPasswordReset.mockResolvedValue(undefined)
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.click(
      screen.getByRole("button", { name: "Forgot password?" })
    )
    await userEvent.click(screen.getByRole("button", { name: "Send link" }))

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "israel@example.com",
    })
    expect(
      screen.getByText(
        "If an account exists for this email, a reset link was sent."
      )
    ).toBeInTheDocument()
  })
})
