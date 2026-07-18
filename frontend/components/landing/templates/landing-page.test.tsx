import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LandingPage } from "./landing-page"

vi.mock("@/components/atoms/theme-toggle-button", () => ({
  ThemeToggleButton: () => (
    <button type="button" aria-label="Switch to dark mode">
      Toggle theme
    </button>
  ),
}))

vi.mock("@/components/atoms/brand", () => ({
  Brand: () => <div>reason</div>,
  ReasonMark: () => <svg aria-hidden="true" />,
}))

describe("LandingPage", () => {
  it("shows the English product landing without implementation-status copy", () => {
    render(<LandingPage />)

    expect(
      screen.getByRole("heading", {
        name: /where every idea can become a page\./i,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/A workspace shaped by blocks/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Launch notes/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Team wiki/i)).toBeInTheDocument()

    expect(screen.queryByText(/desafio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/challenge/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/M1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/local editor/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/editor local/i)).not.toBeInTheDocument()
  })

  it("uses product-scoped architecture language", () => {
    render(<LandingPage />)

    expect(screen.getByText("Block editor")).toBeInTheDocument()
    expect(screen.getByText("Protected workspace")).toBeInTheDocument()
    expect(screen.getByText("Operation-based sync")).toBeInTheDocument()
    expect(screen.getByText("AI writes through blocks")).toBeInTheDocument()

    expect(screen.queryByText(/pronta/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ready/i)).not.toBeInTheDocument()
  })

  it("links the Android beta to the stable GitHub release asset", () => {
    render(<LandingPage />)

    expect(
      screen.getByRole("link", { name: "Download Android beta APK" })
    ).toHaveAttribute(
      "href",
      "https://github.com/IsraelAraujo70/notion-clone/releases/download/android-beta/reason-beta.apk"
    )
  })

  describe("rotating headline word", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("starts on 'become' and cycles to the next word", () => {
      render(<LandingPage />)

      expect(screen.getByText("become")).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2400)
      })

      expect(screen.getByText("fill")).toBeInTheDocument()
    })
  })
})
