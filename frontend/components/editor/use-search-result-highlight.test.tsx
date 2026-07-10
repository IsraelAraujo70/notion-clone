import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  SEARCH_HIGHLIGHT_DURATION_MS,
  useSearchResultHighlight,
} from "./use-search-result-highlight"

function Probe({ blockId }: { blockId: string | null }) {
  useSearchResultHighlight(blockId, true)
  return <div data-testid="target" data-block-id="block-1" />
}

describe("useSearchResultHighlight", () => {
  afterEach(() => vi.useRealTimers())

  it("scrolls to the result, marks its location accessibly, and cleans up", () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView")
    const { unmount } = render(<Probe blockId="block-1" />)
    const target = screen.getByTestId("target")

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    })
    expect(target).toHaveAttribute("aria-current", "location")
    expect(target).toHaveClass("ring-2", "ring-ring", "bg-accent")

    act(() => vi.advanceTimersByTime(SEARCH_HIGHLIGHT_DURATION_MS))
    expect(target).not.toHaveAttribute("aria-current")
    expect(target).not.toHaveClass("ring-2")

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
