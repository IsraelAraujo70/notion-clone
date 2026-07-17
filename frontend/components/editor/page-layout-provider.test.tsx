import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PAGE_FULL_WIDTH_STORAGE_KEY,
  PageLayoutProvider,
  usePageLayout,
} from "@/components/editor/page-layout-provider"

function LayoutHarness() {
  const { fullWidth, setFullWidth } = usePageLayout()
  return (
    <button type="button" onClick={() => setFullWidth(!fullWidth)}>
      {fullWidth ? "full" : "centered"}
    </button>
  )
}

function renderLayout() {
  return render(
    <PageLayoutProvider>
      <LayoutHarness />
    </PageLayoutProvider>
  )
}

describe("PageLayoutProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it("uses centered layout by default and persists changes", async () => {
    renderLayout()

    const toggle = screen.getByRole("button", { name: "centered" })
    await userEvent.click(toggle)

    expect(toggle).toHaveTextContent("full")
    expect(localStorage.getItem(PAGE_FULL_WIDTH_STORAGE_KEY)).toBe("true")
  })

  it("restores the persisted full-width preference", () => {
    localStorage.setItem(PAGE_FULL_WIDTH_STORAGE_KEY, "true")

    renderLayout()

    expect(screen.getByRole("button", { name: "full" })).toBeInTheDocument()
  })

  it("keeps working in memory when localStorage is unavailable", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    renderLayout()

    const toggle = screen.getByRole("button")
    const initialLayout = toggle.textContent
    await userEvent.click(toggle)

    expect(toggle.textContent).not.toBe(initialLayout)
  })
})
