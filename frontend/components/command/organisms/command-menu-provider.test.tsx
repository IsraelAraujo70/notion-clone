import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommandMenuProvider, useCommandMenu } from "./command-menu-provider"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ logout: mocks.logout }),
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
  })

  it("opens from keyboard and navigates dashboard sections", async () => {
    render(
      <CommandMenuProvider>
        <Trigger />
      </CommandMenuProvider>
    )

    await userEvent.keyboard("{Meta>}k{/Meta}")
    expect(
      screen.getByPlaceholderText("Buscar comandos...")
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText("Sem título"))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard")
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
})
