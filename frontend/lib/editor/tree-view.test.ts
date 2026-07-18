import { describe, expect, it } from "vitest"

import { defaultDatabaseProperties } from "@reason/core/database"
import {
  applyOperation,
  createPageTree,
  newBlock,
} from "@reason/core/engine/tree"
import { visibleBlocks } from "./tree-view"

describe("visibleBlocks", () => {
  it("keeps database rows inside the database renderer", () => {
    let tree = createPageTree("Test", "page-root")
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: "insert-database",
      block: newBlock("database", defaultDatabaseProperties(), "database"),
      parentId: tree.rootId,
      index: 0,
    }).tree
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: "insert-row",
      block: newBlock(
        "database_row",
        { title: "Task", status: "not_started" },
        "row"
      ),
      parentId: "database",
      index: 0,
    }).tree

    expect(visibleBlocks(tree, new Set()).map((item) => item.block.id)).toEqual(
      ["database"]
    )
  })
})
