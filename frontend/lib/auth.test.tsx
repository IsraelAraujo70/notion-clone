import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_UNAUTHORIZED_EVENT } from "@/lib/api"
import { AuthProvider } from "./auth"

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")

  return {
    ...actual,
    api: {
      ...actual.api,
      me: mocks.me,
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.me.mockReset().mockImplementation(() => new Promise(() => undefined))
    mocks.replace.mockReset()
  })

  it("clears stale sessions and redirects to the landing page", async () => {
    localStorage.setItem("notion_clone_token", "expired-token")
    render(
      <AuthProvider>
        <div />
      </AuthProvider>
    )

    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"))
    expect(localStorage.getItem("notion_clone_token")).toBeNull()
  })
})
