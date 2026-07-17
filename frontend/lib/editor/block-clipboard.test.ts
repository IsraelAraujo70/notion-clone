import { describe, expect, it, vi } from "vitest"
import {
  applyOperation,
  createPageTree,
  newBlock,
} from "@reason/core/engine/tree"
import {
  BLOCK_CLIPBOARD_MIME,
  type ClipboardBlock,
  clearFallbackBlockClipboard,
  clipboardPlainText,
  createClipboardInsertOperations,
  crossBlockSelectionMarkdown,
  fallbackBlockClipboard,
  isRecoverableBlockClipboard,
  readClipboardEvent,
  serializeBlocks,
  writeClipboardEvent,
  writeNavigatorClipboard,
} from "./block-clipboard"
import { parseMarkdownBlocks } from "./markdown"

describe("block clipboard", () => {
  it("clears a previous structured fallback before textual copy", () => {
    const payload = {
      version: 1 as const,
      blocks: [
        {
          type: "paragraph" as const,
          properties: { text: "alpha" },
          children: [],
        },
      ],
    }
    const values = new Map<string, string>()
    writeClipboardEvent(
      {
        files: [],
        setData: (type: string, value: string) => values.set(type, value),
        getData: (type: string) => values.get(type) ?? "",
      } as unknown as DataTransfer,
      payload
    )
    expect(fallbackBlockClipboard()).not.toBeNull()

    clearFallbackBlockClipboard()

    expect(fallbackBlockClipboard()).toBeNull()
  })

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

    const markdown = crossBlockSelectionMarkdown(
      container,
      [
        { block: heading, depth: 0 },
        { block: bullet, depth: 1 },
        { block: numbered, depth: 1 },
      ],
      selection
    )
    expect(markdown).toBe("# map\n\n  - Nested item\n\n  1. Ordered")
    expect(parseMarkdownBlocks(markdown!)).toEqual([
      { blockType: "heading1", properties: { text: "map" } },
      { blockType: "bulleted_list_item", properties: { text: "Nested item" } },
      { blockType: "numbered_list_item", properties: { text: "Ordered" } },
    ])

    selection.removeAllRanges()
    container.remove()
  })

  it("includes code, Mermaid, divider and image rows between endpoints", () => {
    const first = newBlock("paragraph", { text: "alpha" }, "first")
    const code = newBlock(
      "code",
      { text: 'const fence = "```"', language: "typescript" },
      "code"
    )
    const mermaid = newBlock(
      "mermaid",
      { text: "flowchart LR\n  A --> B" },
      "mermaid"
    )
    const divider = newBlock("divider", {}, "divider")
    const image = newBlock(
      "image",
      { caption: "Diagram", url: "https://example.com/diagram.png" },
      "image"
    )
    const last = newBlock("paragraph", { text: "omega" }, "last")
    const blocks = [first, code, mermaid, divider, image, last]
    const container = document.createElement("div")
    for (const block of blocks) {
      const row = document.createElement("div")
      row.dataset.blockId = block.id
      if (block === first || block === last) {
        const editable = document.createElement("div")
        editable.dataset.blockTextEditor = "true"
        editable.textContent = String(block.properties.text)
        row.append(editable)
      }
      container.append(row)
    }
    document.body.append(container)
    const firstText = container.firstElementChild!.firstChild!.firstChild!
    const lastText = container.lastElementChild!.firstChild!.firstChild!
    const range = document.createRange()
    range.setStart(firstText, 2)
    range.setEnd(lastText, 2)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    const markdown = crossBlockSelectionMarkdown(
      container,
      blocks.map((block) => ({ block, depth: 0 })),
      selection
    )
    expect(markdown).toBe(
      'pha\n\n````typescript\nconst fence = "```"\n````\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n---\n\n![Diagram](<https://example.com/diagram.png>)\n\nom'
    )
    expect(parseMarkdownBlocks(markdown!)).toEqual([
      { blockType: "paragraph", properties: { text: "pha" } },
      {
        blockType: "code",
        properties: {
          text: 'const fence = "```"',
          language: "typescript",
        },
      },
      {
        blockType: "mermaid",
        properties: { text: "flowchart LR\n  A --> B" },
      },
      { blockType: "divider", properties: {} },
      {
        blockType: "paragraph",
        properties: {
          text: "![Diagram](<https://example.com/diagram.png>)",
        },
      },
      { blockType: "paragraph", properties: { text: "om" } },
    ])

    selection.removeAllRanges()
    container.remove()
  })

  it("round-trips separate paragraphs that begin with Markdown markers", () => {
    const first = newBlock("paragraph", { text: "# literal heading" }, "first")
    const second = newBlock("paragraph", { text: "- literal item" }, "second")
    const container = document.createElement("div")
    for (const block of [first, second]) {
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
    const range = document.createRange()
    range.setStart(editables[0].firstChild!, 0)
    range.setEnd(editables[1].firstChild!, editables[1].textContent!.length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    const markdown = crossBlockSelectionMarkdown(
      container,
      [
        { block: first, depth: 0 },
        { block: second, depth: 0 },
      ],
      selection
    )
    expect(markdown).toBe("\\# literal heading\n\n\\- literal item")
    expect(parseMarkdownBlocks(markdown!)).toEqual([
      { blockType: "paragraph", properties: { text: "# literal heading" } },
      { blockType: "paragraph", properties: { text: "- literal item" } },
    ])

    selection.removeAllRanges()
    container.remove()
  })

  it("skips empty endpoint markers in forward and backward selections", () => {
    const heading = newBlock("heading1", { text: "Title" }, "heading")
    const middle = newBlock("paragraph", { text: "middle" }, "middle")
    const numbered = newBlock(
      "numbered_list_item",
      { text: "Last" },
      "numbered"
    )
    const blocks = [heading, middle, numbered]
    const container = document.createElement("div")
    for (const block of blocks) {
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
    const rows = blocks.map((block) => ({ block, depth: 0 }))
    const forward = document.createRange()
    forward.setStart(editables[0].firstChild!, 5)
    forward.setEnd(editables[2].firstChild!, 2)
    selection.removeAllRanges()
    selection.addRange(forward)
    expect(crossBlockSelectionMarkdown(container, rows, selection)).toBe(
      "middle\n\n1. La"
    )

    selection.setBaseAndExtent(
      editables[2].firstChild!,
      0,
      editables[0].firstChild!,
      2
    )
    expect(selection.anchorNode).toBe(editables[2].firstChild)
    expect(crossBlockSelectionMarkdown(container, rows, selection)).toBe(
      "# tle\n\nmiddle"
    )

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

  it("exports text/plain as Markdown", () => {
    expect(
      clipboardPlainText({
        version: 1,
        blocks: [
          { type: "heading2", properties: { text: "Plan" }, children: [] },
          {
            type: "to_do",
            properties: { text: "Ship", checked: true },
            children: [],
          },
          {
            type: "code",
            properties: { text: "const ready = true", language: "typescript" },
            children: [],
          },
        ],
      })
    ).toBe("## Plan\n- [x] Ship\n```typescript\nconst ready = true\n```")
  })

  it("uses plain text when an event clipboard rejects the structured MIME", () => {
    const values = new Map<string, string>()
    writeClipboardEvent(
      {
        setData: (type: string, value: string) => {
          if (type === BLOCK_CLIPBOARD_MIME) throw new Error("unsupported")
          values.set(type, value)
        },
      } as DataTransfer,
      {
        version: 1,
        blocks: [
          { type: "paragraph", properties: { text: "safe" }, children: [] },
        ],
      }
    )

    expect(values.get("text/plain")).toBe("safe")
  })

  it("rejects payloads that cannot be recreated by structured paste", () => {
    const paragraph = {
      type: "paragraph" as const,
      properties: { text: "block" },
      children: [],
    }
    const tooMany = {
      version: 1 as const,
      blocks: Array.from({ length: 201 }, () => ({ ...paragraph })),
    }
    let nested: ClipboardBlock = paragraph
    for (let depth = 1; depth < 21; depth += 1) {
      nested = { ...paragraph, children: [nested] }
    }

    expect(isRecoverableBlockClipboard(tooMany)).toBe(false)
    expect(isRecoverableBlockClipboard({ version: 1, blocks: [nested] })).toBe(
      false
    )
    expect(
      isRecoverableBlockClipboard({
        version: 1,
        blocks: [
          {
            type: "image",
            properties: { url: "https://example.com/image.png" },
            children: [],
          },
        ],
      })
    ).toBe(false)
    expect(
      isRecoverableBlockClipboard({
        version: 1,
        blocks: [
          {
            type: "toggle",
            properties: { text: "Details" },
            children: [{ type: "divider", properties: {}, children: [] }],
          },
        ],
      })
    ).toBe(true)
  })

  it("labels writeText fallback as lossy for nested and non-text blocks", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const payload = {
      version: 1 as const,
      blocks: [
        {
          type: "toggle" as const,
          properties: { text: "Details" },
          children: [
            { type: "divider" as const, properties: {}, children: [] },
          ],
        },
      ],
    }

    try {
      await expect(writeNavigatorClipboard(payload)).resolves.toBe("text")
      expect(writeText).toHaveBeenCalledWith("Details\n---")
      expect(fallbackBlockClipboard()).toEqual(payload)
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor)
      else Reflect.deleteProperty(navigator, "clipboard")
    }
  })

  it("does not authorize an in-memory fallback when the Clipboard API rejects", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    })

    try {
      await expect(
        writeNavigatorClipboard({
          version: 1,
          blocks: [
            {
              type: "paragraph",
              properties: { text: "not copied" },
              children: [],
            },
          ],
        })
      ).rejects.toThrow("denied")
      expect(fallbackBlockClipboard()?.blocks[0]?.properties.text).not.toBe(
        "not copied"
      )
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor)
      else Reflect.deleteProperty(navigator, "clipboard")
    }
  })
})
