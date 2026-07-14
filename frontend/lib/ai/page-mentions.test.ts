import { describe, expect, it } from "vitest"
import {
  activePageMention,
  hasPageMention,
  insertPageMention,
} from "./page-mentions"

describe("page mentions", () => {
  it("finds only the active query at the caret", () => {
    expect(activePageMention("Compare @metro", 14)).toEqual({
      start: 8,
      end: 14,
      query: "metro",
    })
    expect(activePageMention("email@example.com", 17)).toBeNull()
    expect(activePageMention("@done then text", 15)).toBeNull()
  })

  it("replaces the active query with the selected page title", () => {
    expect(
      insertPageMention(
        "Improve @metro please",
        { start: 8, end: 14, query: "metro" },
        "Project Atlas"
      )
    ).toEqual({ value: "Improve @Project Atlas please", cursor: 22 })
  })

  it("matches complete visible mention tokens", () => {
    expect(hasPageMention("Compare @Roadmap", "Roadmap")).toBe(true)
    expect(hasPageMention("Compare @Roadmap", "Road")).toBe(false)
  })
})
