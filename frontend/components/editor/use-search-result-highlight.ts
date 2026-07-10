"use client"

import { useEffect } from "react"

export const SEARCH_HIGHLIGHT_DURATION_MS = 2500

export function useSearchResultHighlight(
  blockId: string | null,
  contentReady: boolean
) {
  useEffect(() => {
    if (!contentReady || !blockId) return
    const element = Array.from(
      document.querySelectorAll<HTMLElement>("[data-block-id]")
    ).find((candidate) => candidate.dataset.blockId === blockId)
    if (!element) return

    element.scrollIntoView({ behavior: "smooth", block: "center" })
    element.classList.add("ring-2", "ring-ring", "bg-accent")
    element.setAttribute("aria-current", "location")
    const timeout = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-ring", "bg-accent")
      element.removeAttribute("aria-current")
    }, SEARCH_HIGHLIGHT_DURATION_MS)

    return () => {
      window.clearTimeout(timeout)
      element.classList.remove("ring-2", "ring-ring", "bg-accent")
      element.removeAttribute("aria-current")
    }
  }, [blockId, contentReady])
}
