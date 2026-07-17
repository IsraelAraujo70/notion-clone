import { describe, expect, it } from "vitest"
import {
  applyOperation,
  createPageTree,
  newBlock,
} from "@reason/core/engine/tree"
import {
  BLOCK_CLIPBOARD_MIME,
  createClipboardInsertOperations,
  crossBlockSelectionMarkdown,
  readClipboardEvent,
  serializeBlocks,
} from "./block-clipboard"

describe("block clipboard", () => {
  it("serializes partial nested and ordered text selections as Markdown", () => {
    const heading = newBlock("heading1", { text: "Roadmap" }, "heading")
    const bullet = newBlock(
      "bulleted_list_item",
      { text: "Nested item" },
      "bullet"
    )
    const numbered = newBlock(
      "numbered_list_item",
      { text: "Ordered item" },
      "numbered"
    )
    const container = document.createElement("div")
    for (const block of [heading, bullet, numbered]) {
      const row = document.createElement("div")
      row.dataset.blockId = block.id
      const editable = document.createElement("div")
      editable.dataset.blockTextEditor = "true"
      editable.textContent = String(block.properties.text)
      row.append(editable)
      container.append(row)
    }
    document.body.append(container)
    const editables = container.querySelectorAll<HTMLElement>(
      '[data-block-text-editor="true"]'
    )
    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(editables[0].firstChild!, 4)
    range.setEnd(editables[2].firstChild!, 7)
    selection.removeAllRanges()
    selection.addRange(range)

    expect(
      crossBlockSelectionMarkdown(
        container,
        [
          { block: heading, depth: 0 },
          { block: bullet, depth: 1 },
          { block: numbered, depth: 1 },
        ],
        selection
      )
    ).toBe("# map\n  - Nested item\n  1. Ordered")

    selection.removeAllRanges()
    container.remove()
  })

  it("does not replace native copy inside one block", () => {
    const block = newBlock("heading2", { text: "Native" }, "heading")
    const container = document.createElement("div")
    const row = document.createElement("div")
    row.dataset.blockId = block.id
    const editable = document.createElement("div")
    editable.dataset.blockTextEditor = "true"
    editable.textContent = "Native"
    row.append(editable)
    container.append(row)
    document.body.append(container)
    const range = document.createRange()
    range.setStart(editable.firstChild!, 1)
    range.setEnd(editable.firstChild!, 4)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(
      crossBlockSelectionMarkdown(container, [{ block, depth: 0 }], selection)
    ).toBeNull()

    selection.removeAllRanges()
    container.remove()
  })

  it("serializes subtrees without persisted identity and recreates fresh inserts", () => {
    let tree = createPageTree("Clipboard", "root")
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: "insert-toggle",
      block: newBlock("toggle", { text: "Parent" }, "toggle"),
      parentId: "root",
      index: 0,
    }).tree
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: "insert-child",
      block: newBlock("to_do", { text: "Child", checked: true }, "child"),
      parentId: "toggle",
      index: 0,
    }).tree

    const payload = serializeBlocks(tree, ["toggle"])
    expect(payload.blocks[0]).toMatchObject({
      type: "toggle",
      properties: { text: "Parent" },
      children: [
        { type: "to_do", properties: { text: "Child", checked: true } },
      ],
    })

    let nextId = 0
    const operations = createClipboardInsertOperations(
      payload,
      "root",
      1,
      "workspace",
      () => `fresh-${nextId++}`
    )
    expect(operations).toHaveLength(2)
    expect(operations[0]).toMatchObject({
      type: "insert_block",
      parentId: "root",
      index: 1,
      block: { id: "fresh-0", type: "toggle" },
    })
    expect(operations[1]).toMatchObject({
      type: "insert_block",
      parentId: "fresh-0",
      index: 0,
      block: { id: "fresh-2", type: "to_do" },
    })
  })

  it("rejects malformed and oversized structured clipboard payloads", () => {
    const clipboard = (value: string) =>
      ({
        getData: (type: string) =>
          type === BLOCK_CLIPBOARD_MIME ? value : "external text",
      }) as DataTransfer

    expect(
      readClipboardEvent(
        clipboard(JSON.stringify({ version: 1, blocks: [{ type: "unknown" }] }))
      )
    ).toBeNull()
    expect(
      readClipboardEvent(
        clipboard(
          JSON.stringify({
            version: 1,
            blocks: [
              {
                type: "paragraph",
                properties: { text: "bad children" },
                children: null,
              },
            ],
          })
        )
      )
    ).toBeNull()
    expect(
      readClipboardEvent(
        clipboard(
          JSON.stringify({
            version: 1,
            blocks: [
              {
                type: "image",
                properties: { url: "https://tracker.example/pixel.png" },
                children: [],
              },
            ],
          })
        )
      )
    ).toBeNull()
  })
})
