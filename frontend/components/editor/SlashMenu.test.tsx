import { describe, expect, it } from "vitest"

import { filteredSlashItems, SLASH_ITEMS } from "./SlashMenu"

describe("filteredSlashItems", () => {
  it("returns every block type for an empty query", () => {
    expect(filteredSlashItems("")).toEqual(SLASH_ITEMS)
  })

  it.each(["title", "titulo"])(
    "finds every heading with the %s alias",
    (query) => {
      expect(filteredSlashItems(query).map((item) => item.type)).toEqual([
        "heading1",
        "heading2",
        "heading3",
      ])
    }
  )

  it.each(["block", "bloco"])(
    "returns the complete selector for the generic %s query",
    (query) => {
      expect(filteredSlashItems(query)).toEqual(SLASH_ITEMS)
    }
  )
})
