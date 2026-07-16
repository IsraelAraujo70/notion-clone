import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ResetPasswordForm } from "./reset-password-form"

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    resetPassword: mocks.resetPassword,
  },
}))

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    mocks.resetPassword.mockReset()
  })

  it("rejects missing reset tokens", async () => {
    render(<ResetPasswordForm token="" />)

    await userEvent.type(screen.getByLabelText("New password"), "Password123!")
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "Password123!"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" })
    )

    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })

  it("submits a strong matching password", async () => {
    mocks.resetPassword.mockResolvedValue(undefined)
    render(<ResetPasswordForm token="reset-token" />)

    await userEvent.type(screen.getByLabelText("New password"), "Password123!")
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "Password123!"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" })
    )

    expect(mocks.resetPassword).toHaveBeenCalledWith({
      token: "reset-token",
      password: "Password123!",
    })
    expect(
      screen.getByText("Password changed. Sign in with your new password.")
    ).toBeInTheDocument()
  })
})
