import { describe, expect, it, vi } from "vitest"
import {
  applyOperation,
  createPageTree,
  newBlock,
} from "@reason/core/engine/tree"
import {
  BLOCK_CLIPBOARD_MIME,
  type ClipboardBlock,
  clipboardPlainText,
  createClipboardInsertOperations,
  fallbackBlockClipboard,
  isRecoverableBlockClipboard,
  readClipboardEvent,
  serializeBlocks,
  writeClipboardEvent,
  writeNavigatorClipboard,
} from "./block-clipboard"

describe("block clipboard", () => {
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
