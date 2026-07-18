import { describe, expect, it } from "vitest"

import { filteredSlashItems, SLASH_ITEMS } from "./SlashMenu"
import { editorPt } from "@/lib/i18n/locales/pt/editor"

describe("filteredSlashItems", () => {
  it("returns every block type for an empty query", () => {
    expect(filteredSlashItems("")).toEqual(SLASH_ITEMS)
  })

  it("finds every heading by its English alias", () => {
    expect(filteredSlashItems("title").map((item) => item.type)).toEqual([
      "heading1",
      "heading2",
      "heading3",
    ])
  })

  it("finds every heading by its Portuguese alias without accents", () => {
    const portugueseItems = SLASH_ITEMS.map((item) => ({
      ...item,
      label: editorPt[item.label],
      keywords: editorPt[item.keywords],
    }))
    expect(
      filteredSlashItems("titulo", portugueseItems).map((item) => item.type)
    ).toEqual(["heading1", "heading2", "heading3"])
  })

  it.each(["block", "bloco"])(
    "returns the complete selector for the generic %s query",
    (query) => {
      expect(filteredSlashItems(query)).toEqual(SLASH_ITEMS)
    }
  )

  it("finds Mermaid by diagram aliases", () => {
    expect(filteredSlashItems("flowchart").map((item) => item.type)).toEqual([
      "mermaid",
    ])
  })

  it("finds databases by table and Kanban aliases", () => {
    expect(filteredSlashItems("kanban").map((item) => item.type)).toEqual([
      "database",
    ])
    expect(filteredSlashItems("table").map((item) => item.type)).toEqual([
      "database",
    ])
  })
})
