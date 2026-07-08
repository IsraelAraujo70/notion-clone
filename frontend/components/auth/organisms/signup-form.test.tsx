import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SignupForm } from "./signup-form"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signup: vi.fn(),
  acceptWorkspaceInvite: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ signup: mocks.signup }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    acceptWorkspaceInvite: mocks.acceptWorkspaceInvite,
  },
}))

describe("SignupForm", () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    mocks.signup.mockReset()
    mocks.acceptWorkspaceInvite.mockReset()
  })

  it("rejects weak passwords before calling the API", async () => {
    render(<SignupForm />)

    await userEvent.type(screen.getByLabelText("Nome"), "Israel")
    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.type(screen.getByLabelText("Senha"), "weakpass")
    await userEvent.type(screen.getByLabelText("Confirmar senha"), "weakpass")
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }))

    expect(mocks.signup).not.toHaveBeenCalled()
  })

  it("rejects mismatched passwords", async () => {
    render(<SignupForm />)

    await userEvent.type(screen.getByLabelText("Nome"), "Israel")
    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.type(screen.getByLabelText("Senha"), "Password123!")
    await userEvent.type(
      screen.getByLabelText("Confirmar senha"),
      "Different123!"
    )

    expect(screen.getByText("As senhas não conferem.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeDisabled()
  })

  it("accepts an invite after signup", async () => {
    mocks.signup.mockResolvedValue({
      token: "secret-token",
      user: {
        id: "user-1",
        email: "israel@example.com",
        display_name: "Israel",
        created_at: "2026-07-08T12:00:00Z",
      },
    })
    mocks.acceptWorkspaceInvite.mockResolvedValue({})
    render(<SignupForm inviteToken="invite-token" />)

    await userEvent.type(screen.getByLabelText("Nome"), "Israel")
    await userEvent.type(screen.getByLabelText("Email"), "israel@example.com")
    await userEvent.type(screen.getByLabelText("Senha"), "Password123!")
    await userEvent.type(
      screen.getByLabelText("Confirmar senha"),
      "Password123!"
    )
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }))

    expect(mocks.signup).toHaveBeenCalledWith({
      email: "israel@example.com",
      password: "Password123!",
      display_name: "Israel",
    })
    expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith(
      "secret-token",
      "invite-token"
    )
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
  })
})
