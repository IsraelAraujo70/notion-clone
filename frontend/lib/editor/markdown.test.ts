import { describe, expect, it } from "vitest"
import {
  detectMarkdownShortcut,
  isStructuredMarkdownPaste,
  parseMarkdownBlocks,
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
      caretOffset: 0,
      replacesBlock: true,
    })
  })

  it("accepts the non-breaking trailing space emitted by contenteditable", () => {
    expect(detectMarkdownShortcut("###\u00a0", 4)).toEqual({
      blockType: "heading3",
      text: "",
      caretOffset: 0,
    })
  })

  it("preserves intentional non-breaking spaces in markers and content", () => {
    expect(detectMarkdownShortcut("[\u00a0] ", 4)).toBeNull()
    expect(detectMarkdownShortcut("###\u00a0before\u00a0after", 4)).toEqual({
      blockType: "heading3",
      text: "before\u00a0after",
      caretOffset: 0,
    })
  })

  it("moves the caret by the removed prefix instead of to the text end", () => {
    expect(detectMarkdownShortcut("### after", 4)).toMatchObject({
      text: "after",
      caretOffset: 0,
    })
  })

  it("ignores prefixes away from the caret", () => {
    expect(detectMarkdownShortcut("# title", 1)).toBeNull()
    expect(detectMarkdownShortcut("hello # ", 8)).toBeNull()
  })
})

describe("parseMarkdownBlocks", () => {
  it("turns pasted Markdown into canonical block drafts", () => {
    expect(
      parseMarkdownBlocks(`# Roadmap

## Now
- First item
1. Ordered item
- [x] Shipped
> Evidence
---
\`\`\`ts
const answer = 43
\`\`\``)
    ).toEqual([
      { blockType: "heading1", properties: { text: "Roadmap" } },
      { blockType: "heading2", properties: { text: "Now" } },
      { blockType: "bulleted_list_item", properties: { text: "First item" } },
      { blockType: "numbered_list_item", properties: { text: "Ordered item" } },
      { blockType: "to_do", properties: { text: "Shipped", checked: true } },
      { blockType: "quote", properties: { text: "Evidence" } },
      { blockType: "divider", properties: {} },
      {
        blockType: "code",
        properties: { text: "const answer = 43", language: "typescript" },
      },
    ])
  })

  it("normalizes CRLF and preserves adjacent paragraph lines", () => {
    expect(parseMarkdownBlocks("first\r\nsecond\r\n\r\nthird")).toEqual([
      { blockType: "paragraph", properties: { text: "first\nsecond" } },
      { blockType: "paragraph", properties: { text: "third" } },
    ])
  })

  it("detects multiline text and single-line block syntax", () => {
    expect(isStructuredMarkdownPaste("plain text")).toBe(false)
    expect(isStructuredMarkdownPaste("plain\ntext")).toBe(true)
    expect(isStructuredMarkdownPaste("# Heading")).toBe(true)
  })

  it("normalizes Unicode line separators and indented bullets from rich clipboards", () => {
    const pasted =
      "Project notes\n### Ideas:\n\t* Explore keyboard navigation.\n### Current work:\u2028\t* Build account settings\n\t* Add billing page\u2028\t* Improve dashboard\n### Release checklist:\u2028\t* Define scope\n\t* Review accessibility\u2028\t* Run tests\u2028\t* Update docs\u2028\t* Publish changelog\n### Maintenance:\n\t* Archive stale drafts;"

    const blocks = parseMarkdownBlocks(pasted)

    expect(blocks.map((block) => block.blockType)).toEqual([
      "paragraph",
      "heading3",
      "bulleted_list_item",
      "heading3",
      "bulleted_list_item",
      "bulleted_list_item",
      "bulleted_list_item",
      "heading3",
      "bulleted_list_item",
      "bulleted_list_item",
      "bulleted_list_item",
      "bulleted_list_item",
      "bulleted_list_item",
      "heading3",
      "bulleted_list_item",
    ])
    expect(blocks.at(-1)?.properties.text).toBe("Archive stale drafts;")
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
