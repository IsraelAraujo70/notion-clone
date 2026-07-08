import { describe, expect, it } from "vitest"
import {
  detectMarkdownShortcut,
  removeSlashQuery,
  slashQuery,
} from "./markdown"

describe("detectMarkdownShortcut", () => {
  it.each([
    ["# ", 2, "heading1", ""],
    ["## ", 3, "heading2", ""],
    ["### ", 4, "heading3", ""],
    ["- task", 2, "bulleted_list_item", "task"],
    ["* task", 2, "bulleted_list_item", "task"],
    ["1. item", 3, "numbered_list_item", "item"],
    ["[] done", 3, "to_do", "done"],
    ["[ ] done", 4, "to_do", "done"],
    ["> quote", 2, "quote", "quote"],
    ["```", 3, "code", ""],
  ])("maps %j to %s", (text, caret, blockType, nextText) => {
    expect(detectMarkdownShortcut(text, caret)).toMatchObject({
      blockType,
      text: nextText,
    })
  })

  it("detects divider as a block replacement", () => {
    expect(detectMarkdownShortcut("---", 3)).toEqual({
      blockType: "divider",
      text: "",
      replacesBlock: true,
    })
  })

  it("ignores prefixes away from the caret", () => {
    expect(detectMarkdownShortcut("# title", 1)).toBeNull()
    expect(detectMarkdownShortcut("hello # ", 8)).toBeNull()
  })
})

describe("slashQuery", () => {
  it("returns the query after the active slash", () => {
    expect(slashQuery("/hea", 4)).toBe("hea")
    expect(slashQuery("hello /code", 11)).toBe("code")
  })

  it("removes only the active slash query", () => {
    expect(removeSlashQuery("hello /code world", 11)).toEqual({
      text: "hello  world",
      slashIndex: 6,
    })
  })

  it("ignores slash commands once the query contains whitespace", () => {
    expect(slashQuery("/two words", 10)).toBeNull()
    expect(removeSlashQuery("/two words", 10)).toBeNull()
  })
})
