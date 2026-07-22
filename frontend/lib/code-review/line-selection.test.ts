import { describe, expect, it } from "vitest"

import {
  selectionContains,
  toReviewLineRange,
  updateLineSelection,
} from "./line-selection"

describe("line selection", () => {
  it("creates a single-line selection and extends it in either direction", () => {
    const first = updateLineSelection(
      null,
      { path: "a.ts", hunkId: "hunk-0", side: "RIGHT", line: 12 },
      false
    )
    const extended = updateLineSelection(
      first,
      { path: "a.ts", hunkId: "hunk-0", side: "RIGHT", line: 8 },
      true
    )

    expect(toReviewLineRange(extended)).toEqual({
      path: "a.ts",
      side: "RIGHT",
      startLine: 8,
      endLine: 12,
    })
    expect(
      selectionContains(extended, {
        path: "a.ts",
        hunkId: "hunk-0",
        side: "RIGHT",
        line: 10,
      })
    ).toBe(true)
    expect(
      selectionContains(extended, {
        path: "a.ts",
        hunkId: "hunk-0",
        side: "LEFT",
        line: 10,
      })
    ).toBe(false)
  })

  it("starts a new selection when the file or side changes", () => {
    const initial = updateLineSelection(
      null,
      { path: "a.ts", hunkId: "hunk-0", side: "LEFT", line: 3 },
      false
    )
    const next = updateLineSelection(
      initial,
      { path: "a.ts", hunkId: "hunk-0", side: "RIGHT", line: 4 },
      true
    )

    expect(next.anchor).toEqual({
      path: "a.ts",
      hunkId: "hunk-0",
      side: "RIGHT",
      line: 4,
    })
    expect(next.focus).toEqual(next.anchor)
  })

  it("starts a new selection instead of spanning separate hunks", () => {
    const initial = updateLineSelection(
      null,
      { path: "a.ts", hunkId: "hunk-0", side: "RIGHT", line: 3 },
      false
    )
    const next = updateLineSelection(
      initial,
      { path: "a.ts", hunkId: "hunk-1", side: "RIGHT", line: 8 },
      true
    )

    expect(next.anchor).toEqual({
      path: "a.ts",
      hunkId: "hunk-1",
      side: "RIGHT",
      line: 8,
    })
    expect(next.focus).toEqual(next.anchor)
    expect(
      selectionContains(initial, {
        path: "a.ts",
        hunkId: "hunk-1",
        side: "RIGHT",
        line: 3,
      })
    ).toBe(false)
  })
})
