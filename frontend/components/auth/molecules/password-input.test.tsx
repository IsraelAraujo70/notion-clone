import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { PasswordInput } from "./password-input"

describe("PasswordInput", () => {
  it("toggles password visibility", async () => {
    render(<PasswordInput aria-label="Password" value="Password123!" />)

    const input = screen.getByLabelText("Password")
    expect(input).toHaveAttribute("type", "password")

    await userEvent.click(screen.getByRole("button", { name: "Show password" }))
    expect(input).toHaveAttribute("type", "text")

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }))
    expect(input).toHaveAttribute("type", "password")
  })

  it("renders password strength feedback", () => {
    render(
      <PasswordInput aria-label="Password" value="Password123!" showStrength />
    )

    expect(screen.getByText("Strong")).toBeInTheDocument()
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument()
    expect(screen.getByText("Upper and lowercase letters")).toBeInTheDocument()
    expect(screen.getByText("At least one number")).toBeInTheDocument()
    expect(screen.getByText("At least one symbol")).toBeInTheDocument()
  })
})
