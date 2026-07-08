import { describe, expect, it } from "vitest";
import type { Operation } from "@notion-clone/contracts";
import { applyOperation, createPageTree, getBlock, newBlock, visibleTree, type BlockTree } from "./tree";
import { UndoManager } from "./undo";

const oid = () => crypto.randomUUID();

function setup() {
  let tree = createPageTree("Test", "root");
  const undo = new UndoManager();
  const apply = (op: Operation, coalesceKey?: string) => {
    const result = applyOperation(tree, op);
    tree = result.tree;
    undo.record(result.inverse, coalesceKey);
    return tree;
  };
  return {
    apply,
    undo,
    get tree() { return tree; },
    set tree(next: BlockTree) { tree = next; },
  };
}

describe("UndoManager", () => {
  it("undoes and redoes mixed ops exactly", () => {
    const s = setup();
    const snapshots = [visibleTree(s.tree)];
    s.apply({ type: "insert_block", opId: oid(), block: newBlock("paragraph", { text: "a" }, "a"), parentId: "root", index: 0 });
    snapshots.push(visibleTree(s.tree));
    s.apply({ type: "update_block", opId: oid(), blockId: "a", blockType: "heading1", properties: { text: "A" } });
    snapshots.push(visibleTree(s.tree));
    s.apply({ type: "delete_block", opId: oid(), blockId: "a" });
    snapshots.push(visibleTree(s.tree));

    for (let i = snapshots.length - 2; i >= 0; i--) {
      s.tree = s.undo.undo(s.tree);
      expect(visibleTree(s.tree)).toEqual(snapshots[i]);
    }
    expect(s.undo.canUndo).toBe(false);

    for (let i = 1; i < snapshots.length; i++) {
      s.tree = s.undo.redo(s.tree);
      expect(visibleTree(s.tree)).toEqual(snapshots[i]);
    }
    expect(s.undo.canRedo).toBe(false);
  });

  it("coalesces a typing burst into one undo step and redo restores the final text", () => {
    const s = setup();
    s.apply({ type: "insert_block", opId: oid(), block: newBlock("paragraph", { text: "" }, "a"), parentId: "root", index: 0 });
    for (const text of ["h", "he", "hel", "hello"]) {
      s.apply({ type: "update_block", opId: oid(), blockId: "a", properties: { text } }, "text:a");
    }

    s.tree = s.undo.undo(s.tree); // um passo desfaz a rajada inteira
    expect(getBlock(s.tree, "a").properties.text).toBe("");
    s.tree = s.undo.redo(s.tree);
    expect(getBlock(s.tree, "a").properties.text).toBe("hello");

    s.tree = s.undo.undo(s.tree);
    s.tree = s.undo.undo(s.tree); // desfaz o insert
    expect(visibleTree(s.tree).children).toEqual([]);
  });

  it("breakCoalescing starts a new undo group on the same key", () => {
    const s = setup();
    s.apply({ type: "insert_block", opId: oid(), block: newBlock("paragraph", { text: "" }, "a"), parentId: "root", index: 0 });
    s.apply({ type: "update_block", opId: oid(), blockId: "a", properties: { text: "one" } }, "text:a");
    s.undo.breakCoalescing();
    s.apply({ type: "update_block", opId: oid(), blockId: "a", properties: { text: "one two" } }, "text:a");

    s.tree = s.undo.undo(s.tree);
    expect(getBlock(s.tree, "a").properties.text).toBe("one");
    s.tree = s.undo.undo(s.tree);
    expect(getBlock(s.tree, "a").properties.text).toBe("");
  });

  it("recording a new op clears the redo stack", () => {
    const s = setup();
    s.apply({ type: "insert_block", opId: oid(), block: newBlock("paragraph", { text: "a" }, "a"), parentId: "root", index: 0 });
    s.tree = s.undo.undo(s.tree);
    expect(s.undo.canRedo).toBe(true);
    s.apply({ type: "insert_block", opId: oid(), block: newBlock("paragraph", { text: "b" }, "b"), parentId: "root", index: 0 });
    expect(s.undo.canRedo).toBe(false);
  });
});
