import { describe, expect, it } from "vitest"
import type { Block, Operation } from "@/lib/contracts"
import {
  applyAll,
  applyOperation,
  checkInvariants,
  createPageTree,
  EngineError,
  getBlock,
  getChildren,
  newBlock,
  treeFromBlocks,
  visibleTree,
  type BlockTree,
} from "./tree"

const oid = () => crypto.randomUUID()

function insertOp(block: Block, parentId: string, index: number): Operation {
  return { type: "insert_block", opId: oid(), block, parentId, index }
}

/** Página com três parágrafos a, b, c. */
function fixture() {
  let tree = createPageTree("Test", "root")
  const [a, b, c] = [
    newBlock("paragraph", { text: "a" }, "a"),
    newBlock("paragraph", { text: "b" }, "b"),
    newBlock("paragraph", { text: "c" }, "c"),
  ]
  tree = applyAll(tree, [
    insertOp(a, "root", 0),
    insertOp(b, "root", 1),
    insertOp(c, "root", 2),
  ]).tree
  return tree
}

function texts(tree: BlockTree, parentId = "root"): unknown[] {
  return getChildren(tree, parentId).map((child) => child.properties.text)
}

describe("insert_block", () => {
  it("inserts at the given index and clamps out-of-range indexes", () => {
    let tree = fixture()
    tree = applyOperation(
      tree,
      insertOp(newBlock("paragraph", { text: "x" }, "x"), "root", 1)
    ).tree
    expect(texts(tree)).toEqual(["a", "x", "b", "c"])
    tree = applyOperation(
      tree,
      insertOp(newBlock("paragraph", { text: "y" }, "y"), "root", 99)
    ).tree
    expect(texts(tree)).toEqual(["a", "x", "b", "c", "y"])
    checkInvariants(tree)
  })

  it("rejects duplicate ids, missing parents and non-empty content", () => {
    const tree = fixture()
    expect(() =>
      applyOperation(tree, insertOp(newBlock("paragraph", {}, "a"), "root", 0))
    ).toThrow(EngineError)
    expect(() =>
      applyOperation(tree, insertOp(newBlock("paragraph", {}, "z"), "nope", 0))
    ).toThrow(EngineError)
    const withChildren = { ...newBlock("paragraph", {}, "z"), content: ["a"] }
    expect(() =>
      applyOperation(tree, insertOp(withChildren, "root", 0))
    ).toThrow(EngineError)
  })

  it("inverse (delete) hides the inserted block again", () => {
    const before = fixture()
    const { tree, inverse } = applyOperation(
      before,
      insertOp(newBlock("paragraph", { text: "x" }, "x"), "root", 1)
    )
    const undone = applyAll(tree, inverse).tree
    expect(visibleTree(undone)).toEqual(visibleTree(before))
    checkInvariants(undone)
  })
})

describe("update_block", () => {
  it("patches properties, deletes with null, and turns block types in place", () => {
    let tree = fixture()
    tree = applyOperation(tree, {
      type: "update_block",
      opId: oid(),
      blockId: "a",
      blockType: "to_do",
      properties: { text: "task", checked: true },
    }).tree
    const a = getBlock(tree, "a")
    expect(a.type).toBe("to_do")
    expect(a.properties).toEqual({ text: "task", checked: true })

    tree = applyOperation(tree, {
      type: "update_block",
      opId: oid(),
      blockId: "a",
      properties: { checked: null },
    }).tree
    expect(getBlock(tree, "a").properties).toEqual({ text: "task" })
  })

  it("inverse restores previous type and properties exactly", () => {
    const before = fixture()
    const { tree, inverse } = applyOperation(before, {
      type: "update_block",
      opId: oid(),
      blockId: "b",
      blockType: "heading1",
      properties: { text: "B!", fresh: "new" },
    })
    const undone = applyAll(tree, inverse).tree
    expect(visibleTree(undone)).toEqual(visibleTree(before))
    expect(getBlock(undone, "b").properties).not.toHaveProperty("fresh")
  })

  it("LWW drops stale property writes and applies higher versions", () => {
    let tree = fixture()
    tree = applyOperation(tree, {
      type: "update_block",
      opId: oid(),
      blockId: "a",
      properties: { text: "v1" },
      propVersions: { text: 1 },
    }).tree
    tree = applyOperation(tree, {
      type: "update_block",
      opId: oid(),
      blockId: "a",
      properties: { text: "v2" },
      propVersions: { text: 2 },
    }).tree
    tree = applyOperation(tree, {
      type: "update_block",
      opId: oid(),
      blockId: "a",
      properties: { text: "stale", checked: true },
      propVersions: { text: 1, checked: 1 },
    }).tree
    const a = getBlock(tree, "a")
    expect(a.properties).toEqual({ text: "v2", checked: true })
    expect(a.propVersions).toMatchObject({ text: 2, checked: 1 })
  })
})

describe("move_block", () => {
  it("reorders within the same parent and inverse restores order", () => {
    const before = fixture()
    const { tree, inverse } = applyOperation(before, {
      type: "move_block",
      opId: oid(),
      blockId: "a",
      newParentId: "root",
      index: 2,
    })
    expect(texts(tree)).toEqual(["b", "c", "a"])
    expect(visibleTree(applyAll(tree, inverse).tree)).toEqual(
      visibleTree(before)
    )
  })

  it("reparents (indent) and inverse restores the original position", () => {
    const before = fixture()
    const { tree, inverse } = applyOperation(before, {
      type: "move_block",
      opId: oid(),
      blockId: "b",
      newParentId: "a",
      index: 0,
    })
    expect(texts(tree)).toEqual(["a", "c"])
    expect(texts(tree, "a")).toEqual(["b"])
    checkInvariants(tree)
    expect(visibleTree(applyAll(tree, inverse).tree)).toEqual(
      visibleTree(before)
    )
  })

  it("rejects cycles, self-parenting and moving the root", () => {
    let tree = fixture()
    tree = applyOperation(tree, {
      type: "move_block",
      opId: oid(),
      blockId: "b",
      newParentId: "a",
      index: 0,
    }).tree
    expect(() =>
      applyOperation(tree, {
        type: "move_block",
        opId: oid(),
        blockId: "a",
        newParentId: "b",
        index: 0,
      })
    ).toThrow("cycle")
    expect(() =>
      applyOperation(tree, {
        type: "move_block",
        opId: oid(),
        blockId: "a",
        newParentId: "a",
        index: 0,
      })
    ).toThrow(EngineError)
    expect(() =>
      applyOperation(tree, {
        type: "move_block",
        opId: oid(),
        blockId: "root",
        newParentId: "a",
        index: 0,
      })
    ).toThrow("root")
  })
})

describe("delete_block / restore_block", () => {
  it("trashes a subtree, keeps it intact, and restores it in place", () => {
    let tree = fixture()
    tree = applyOperation(tree, {
      type: "move_block",
      opId: oid(),
      blockId: "c",
      newParentId: "b",
      index: 0,
    }).tree
    const beforeDelete = visibleTree(tree)

    tree = applyOperation(tree, {
      type: "delete_block",
      opId: oid(),
      blockId: "b",
    }).tree
    expect(texts(tree)).toEqual(["a"])
    checkInvariants(tree)

    tree = applyOperation(tree, {
      type: "restore_block",
      opId: oid(),
      blockId: "b",
    }).tree
    expect(visibleTree(tree)).toEqual(beforeDelete)
    expect(texts(tree)).toEqual(["a", "b"])
    expect(texts(tree, "b")).toEqual(["c"])
  })

  it("rejects deleting the root, double delete and restoring live blocks", () => {
    let tree = fixture()
    expect(() =>
      applyOperation(tree, {
        type: "delete_block",
        opId: oid(),
        blockId: "root",
      })
    ).toThrow("root")
    expect(() =>
      applyOperation(tree, { type: "restore_block", opId: oid(), blockId: "a" })
    ).toThrow(EngineError)
    tree = applyOperation(tree, {
      type: "delete_block",
      opId: oid(),
      blockId: "a",
    }).tree
    expect(() =>
      applyOperation(tree, { type: "delete_block", opId: oid(), blockId: "a" })
    ).toThrow(EngineError)
    expect(() =>
      applyOperation(tree, {
        type: "update_block",
        opId: oid(),
        blockId: "a",
        properties: { text: "x" },
      })
    ).toThrow(EngineError)
  })
})

describe("transfer_subtree", () => {
  it("removes a complete subtree from the source and inserts it at the destination root", () => {
    let source = fixture()
    source = applyOperation(source, {
      type: "move_block",
      opId: oid(),
      blockId: "c",
      newParentId: "b",
      index: 0,
    }).tree
    const transferred = [getBlock(source, "b"), getBlock(source, "c")].map(
      (block) => ({ ...block, workspaceId: "source" })
    )

    source = applyOperation(source, {
      type: "transfer_subtree_out",
      opId: oid(),
      transferId: oid(),
      blockId: "b",
      destinationWorkspaceId: "destination",
    }).tree
    expect(source.blocks.has("b")).toBe(false)
    expect(source.blocks.has("c")).toBe(false)
    expect(texts(source)).toEqual(["a"])
    checkInvariants(source)

    const destination = applyOperation(
      createPageTree("Destination", "dest-root"),
      {
        type: "transfer_subtree_in",
        opId: oid(),
        transferId: oid(),
        blocks: transferred,
        parentId: "dest-root",
        index: 0,
        sourceWorkspaceId: "source",
      }
    ).tree
    expect(texts(destination, "dest-root")).toEqual(["b"])
    expect(texts(destination, "b")).toEqual(["c"])
    expect(getBlock(destination, "b").parentId).toBe("dest-root")
    expect(getBlock(destination, "c").workspaceId).toBe("local")
    checkInvariants(destination)
  })
})

describe("fuzz: random ops keep invariants and undo returns to the start", () => {
  // PRNG seedado (mulberry32): o teste é determinístico.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it("200 random ops, invariants hold, full undo is exact", () => {
    const rand = rng(42)
    const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]
    let tree = fixture()
    const initial = visibleTree(tree)
    const undoLog: Operation[] = []
    const trashed: string[] = []

    const activeIds = (id = "root", acc: string[] = []): string[] => {
      acc.push(id)
      for (const child of getChildren(tree, id)) activeIds(child.id, acc)
      return acc
    }
    const subtreeIds = (id: string, acc: string[] = []): string[] => {
      acc.push(id)
      for (const childId of getBlock(tree, id).content) subtreeIds(childId, acc)
      return acc
    }

    let created = 0
    for (let i = 0; i < 200; i++) {
      const active = activeIds()
      const nonRoot = active.filter((id) => id !== "root")
      const roll = rand()
      let op: Operation | null = null

      if (roll < 0.35) {
        op = insertOp(
          newBlock("paragraph", { text: `n${created++}` }, `n${created}`),
          pick(active),
          Math.floor(rand() * 5)
        )
      } else if (roll < 0.6 && nonRoot.length) {
        op = {
          type: "update_block",
          opId: oid(),
          blockId: pick(nonRoot),
          properties: { text: `e${i}` },
        }
      } else if (roll < 0.8 && nonRoot.length) {
        const blockId = pick(nonRoot)
        const forbidden = new Set(subtreeIds(blockId))
        const parents = active.filter((id) => !forbidden.has(id))
        if (parents.length)
          op = {
            type: "move_block",
            opId: oid(),
            blockId,
            newParentId: pick(parents),
            index: Math.floor(rand() * 5),
          }
      } else if (roll < 0.9 && nonRoot.length) {
        const blockId = pick(nonRoot)
        trashed.push(blockId)
        op = { type: "delete_block", opId: oid(), blockId }
      } else if (trashed.length) {
        op = {
          type: "restore_block",
          opId: oid(),
          blockId: trashed.splice(Math.floor(rand() * trashed.length), 1)[0],
        }
      }
      if (!op) continue

      const result = applyOperation(tree, op)
      tree = result.tree
      undoLog.unshift(...result.inverse)
      checkInvariants(tree)
    }

    const undone = applyAll(tree, undoLog).tree
    checkInvariants(undone)
    expect(visibleTree(undone)).toEqual(initial)
  })
})

describe("server-backed blocks", () => {
  it("newBlock takes the real workspace id, defaulting to the local one", () => {
    expect(newBlock("paragraph").workspaceId).toBe("local")
    expect(newBlock("paragraph", { text: "" }, "b1", "ws-1").workspaceId).toBe(
      "ws-1"
    )
  })

  it("treeFromBlocks rebuilds the tree the server sent", () => {
    const root: Block = {
      ...newBlock("page", { title: "Notas" }, "root", "ws-1"),
      content: ["child"],
    }
    const child: Block = {
      ...newBlock("paragraph", { text: "oi" }, "child", "ws-1"),
      parentId: "root",
    }

    const tree = treeFromBlocks("root", [root, child])
    checkInvariants(tree)
    expect(getChildren(tree, "root").map((block) => block.id)).toEqual([
      "child",
    ])
  })
})
