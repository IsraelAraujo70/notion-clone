import { describe, expect, it } from "vitest"
import type { Operation } from "@reason/core/contracts"
import {
  applyOperation,
  createPageTree,
  getBlock,
  newBlock,
  visibleTree,
  type BlockTree,
} from "@reason/core/engine/tree"
import { UndoManager } from "@reason/core/engine/undo"

const oid = () => crypto.randomUUID()

function setup() {
  let tree = createPageTree("Test", "root")
  const undo = new UndoManager()
  const apply = (op: Operation, coalesceKey?: string) => {
    const result = applyOperation(tree, op)
    tree = result.tree
    undo.record(result.inverse, coalesceKey)
    return tree
  }
  return {
    apply,
    undo,
    get tree() {
      return tree
    },
    set tree(next: BlockTree) {
      tree = next
    },
  }
}

describe("UndoManager", () => {
  it("undoes and redoes mixed ops exactly", () => {
    const s = setup()
    const snapshots = [visibleTree(s.tree)]
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "a" }, "a"),
      parentId: "root",
      index: 0,
    })
    snapshots.push(visibleTree(s.tree))
    s.apply({
      type: "update_block",
      opId: oid(),
      blockId: "a",
      blockType: "heading1",
      properties: { text: "A" },
    })
    snapshots.push(visibleTree(s.tree))
    s.apply({ type: "delete_block", opId: oid(), blockId: "a" })
    snapshots.push(visibleTree(s.tree))

    for (let i = snapshots.length - 2; i >= 0; i--) {
      s.tree = s.undo.undo(s.tree).tree
      expect(visibleTree(s.tree)).toEqual(snapshots[i])
    }
    expect(s.undo.canUndo).toBe(false)

    for (let i = 1; i < snapshots.length; i++) {
      s.tree = s.undo.redo(s.tree).tree
      expect(visibleTree(s.tree)).toEqual(snapshots[i])
    }
    expect(s.undo.canRedo).toBe(false)
  })

  it("coalesces a typing burst into one undo step and redo restores the final text", () => {
    const s = setup()
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "" }, "a"),
      parentId: "root",
      index: 0,
    })
    for (const text of ["h", "he", "hel", "hello"]) {
      s.apply(
        {
          type: "update_block",
          opId: oid(),
          blockId: "a",
          properties: { text },
        },
        "text:a"
      )
    }

    s.tree = s.undo.undo(s.tree).tree // um passo desfaz a rajada inteira
    expect(getBlock(s.tree, "a").properties.text).toBe("")
    s.tree = s.undo.redo(s.tree).tree
    expect(getBlock(s.tree, "a").properties.text).toBe("hello")

    s.tree = s.undo.undo(s.tree).tree
    s.tree = s.undo.undo(s.tree).tree // desfaz o insert
    expect(visibleTree(s.tree).children).toEqual([])
  })

  it("breakCoalescing starts a new undo group on the same key", () => {
    const s = setup()
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "" }, "a"),
      parentId: "root",
      index: 0,
    })
    s.apply(
      {
        type: "update_block",
        opId: oid(),
        blockId: "a",
        properties: { text: "one" },
      },
      "text:a"
    )
    s.undo.breakCoalescing()
    s.apply(
      {
        type: "update_block",
        opId: oid(),
        blockId: "a",
        properties: { text: "one two" },
      },
      "text:a"
    )

    s.tree = s.undo.undo(s.tree).tree
    expect(getBlock(s.tree, "a").properties.text).toBe("one")
    s.tree = s.undo.undo(s.tree).tree
    expect(getBlock(s.tree, "a").properties.text).toBe("")
  })

  it("recording a new op clears the redo stack", () => {
    const s = setup()
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "a" }, "a"),
      parentId: "root",
      index: 0,
    })
    s.tree = s.undo.undo(s.tree).tree
    expect(s.undo.canRedo).toBe(true)
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "b" }, "b"),
      parentId: "root",
      index: 0,
    })
    expect(s.undo.canRedo).toBe(false)
  })

  it("keeps an open AI group at its first op in chronological undo order", () => {
    const s = setup()
    const applyAi = (op: Operation) => {
      const result = applyOperation(s.tree, op)
      s.tree = result.tree
      s.undo.recordOpenGroup("ai-group", result.inverse)
    }

    applyAi({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "AI first" }, "ai-first"),
      parentId: "root",
      index: 0,
    })
    s.apply({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "Human" }, "human"),
      parentId: "root",
      index: 1,
    })
    applyAi({
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "AI later" }, "ai-later"),
      parentId: "root",
      index: 2,
    })
    s.undo.closeGroup("ai-group")

    s.tree = s.undo.undo(s.tree).tree
    expect(
      visibleTree(s.tree).children.map((child) => child.properties.text)
    ).toEqual(["AI first", "AI later"])

    s.tree = s.undo.undo(s.tree).tree
    expect(visibleTree(s.tree).children).toEqual([])
  })

  it("keeps accumulated inverses when a failed open group closes", () => {
    const s = setup()
    const result = applyOperation(s.tree, {
      type: "insert_block",
      opId: oid(),
      block: newBlock("paragraph", { text: "Partial" }, "partial"),
      parentId: "root",
      index: 0,
    })
    s.tree = result.tree
    s.undo.recordOpenGroup("failed-group", result.inverse)
    expect(s.undo.canUndo).toBe(false)

    s.undo.closeGroup("failed-group")
    expect(s.undo.canUndo).toBe(true)
    s.tree = s.undo.undo(s.tree).tree
    expect(visibleTree(s.tree).children).toEqual([])
  })
})
