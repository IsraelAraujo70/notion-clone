import { describe, expect, it } from "vitest"
import {
  applyOperation,
  createPageTree,
  newBlock,
} from "@reason/core/engine/tree"
import {
  hasNativeTextSelection,
  intersectsSelectionRect,
  normalizeSelectedRoots,
  planMultiBlockMove,
  rangeSelection,
} from "./block-selection"

function treeWithBlocks() {
  let tree = createPageTree("Selection", "root")
  for (const id of ["a", "b", "c", "d"]) {
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: `insert-${id}`,
      block: newBlock("paragraph", { text: id }, id),
      parentId: "root",
      index: 99,
    }).tree
  }
  tree = applyOperation(tree, {
    type: "insert_block",
    opId: "insert-child",
    block: newBlock("paragraph", { text: "child" }, "child"),
    parentId: "b",
    index: 0,
  }).tree
  return tree
}

describe("block selection", () => {
  it("recognizes native text selection across sibling blocks", () => {
    const container = document.createElement("div")
    const first = document.createElement("div")
    const second = document.createElement("div")
    const third = document.createElement("div")
    first.textContent = "primeiro"
    second.textContent = "segundo"
    third.textContent = "terceiro"
    container.append(first, second, third)
    document.body.append(container)

    const range = document.createRange()
    range.setStart(first.firstChild!, 2)
    range.setEnd(second.firstChild!, 3)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(hasNativeTextSelection(container)).toBe(true)
    expect(hasNativeTextSelection(container, first)).toBe(true)
    expect(hasNativeTextSelection(container, second)).toBe(true)
    expect(hasNativeTextSelection(container, third)).toBe(false)
    expect(hasNativeTextSelection(first)).toBe(false)

    selection.removeAllRanges()
    container.remove()
  })

  it("normalizes selected descendants to their selected roots", () => {
    const tree = treeWithBlocks()
    expect(
      normalizeSelectedRoots(
        tree,
        ["child", "c", "b"],
        ["a", "b", "child", "c", "d"]
      )
    ).toEqual(["b", "c"])
  })

  it("builds visible ranges and strict rectangle intersections", () => {
    expect(rangeSelection(["a", "b", "c", "d"], "b", "d")).toEqual([
      "b",
      "c",
      "d",
    ])
    expect(
      intersectsSelectionRect(
        { left: 0, top: 0, right: 20, bottom: 20 },
        { left: 10, top: 10, right: 30, bottom: 30 }
      )
    ).toBe(true)
    expect(
      intersectsSelectionRect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 10, right: 20, bottom: 20 }
      )
    ).toBe(false)
  })

  it("moves selected roots together above and below while preserving order", () => {
    const visible = ["a", "b", "child", "c", "d"]
    const below = planMultiBlockMove(
      treeWithBlocks(),
      ["a", "c"],
      visible,
      "b",
      "below",
      () => crypto.randomUUID()
    )
    let belowTree = treeWithBlocks()
    for (const operation of below)
      belowTree = applyOperation(belowTree, operation).tree
    expect(belowTree.blocks.get("root")?.content).toEqual(["b", "a", "c", "d"])

    const above = planMultiBlockMove(
      treeWithBlocks(),
      ["a", "c"],
      visible,
      "d",
      "above",
      () => crypto.randomUUID()
    )
    let aboveTree = treeWithBlocks()
    for (const operation of above)
      aboveTree = applyOperation(aboveTree, operation).tree
    expect(aboveTree.blocks.get("root")?.content).toEqual(["b", "a", "c", "d"])
  })

  it("rejects drops inside a selected subtree", () => {
    expect(
      planMultiBlockMove(
        treeWithBlocks(),
        ["b"],
        ["a", "b", "child", "c", "d"],
        "child",
        "below",
        () => crypto.randomUUID()
      )
    ).toEqual([])
  })
})
