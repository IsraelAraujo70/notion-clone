"use client";

import type { Operation } from "@notion-clone/contracts";
import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BlockEditor } from "@/components/BlockEditor";
import { applyOperation, createPageTree, getBlock, newBlock, type BlockTree } from "@/lib/engine/tree";
import { UndoManager } from "@/lib/engine/undo";

function opId() {
  return crypto.randomUUID();
}

function createInitialTree(): BlockTree {
  // Ids fixos: o estado inicial renderiza no SSR e no cliente; ids aleatórios
  // divergem entre os dois e quebram a hidratação do React.
  const page = createPageTree("Sem título", "page-root");
  const first = newBlock("paragraph", { text: "" }, "first-paragraph");
  return applyOperation(page, {
    type: "insert_block",
    opId: "op-initial",
    block: first,
    parentId: page.rootId,
    index: 0,
  }).tree;
}

function titleText(tree: BlockTree) {
  const value = getBlock(tree, tree.rootId).properties.title;
  return typeof value === "string" ? value : "";
}

export default function Home() {
  const [tree, setTree] = useState<BlockTree>(() => createInitialTree());
  const undoRef = useRef(new UndoManager());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const dispatchBatch = useCallback(
    (ops: Operation[], options?: { coalesceKey?: string; breakCoalescing?: boolean }) => {
      if (options?.breakCoalescing) undoRef.current.breakCoalescing();
      if (ops.length === 0) return;
      setTree((current) => {
        let next = current;
        const inverse: Operation[] = [];
        for (const op of ops) {
          const result = applyOperation(next, op);
          next = result.tree;
          inverse.unshift(...result.inverse);
        }
        undoRef.current.record(inverse, options?.coalesceKey);
        return next;
      });
    },
    [],
  );

  const updateTitle = useCallback(
    (title: string) => {
      dispatchBatch(
        [{ type: "update_block", opId: opId(), blockId: tree.rootId, properties: { title } }],
        { coalesceKey: "title" },
      );
    },
    [dispatchBatch, tree.rootId],
  );

  const undo = useCallback(() => {
    undoRef.current.breakCoalescing();
    setTree((current) => undoRef.current.undo(current));
  }, []);

  const redo = useCallback(() => {
    undoRef.current.breakCoalescing();
    setTree((current) => undoRef.current.redo(current));
  }, []);

  const toggleCollapsed = useCallback((blockId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLHeadingElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const firstId = getBlock(tree, tree.rootId).content[0];
        const first = firstId ? document.querySelector<HTMLElement>(`[data-block-id="${firstId}"] [contenteditable="true"]`) : null;
        first?.focus();
      }
    },
    [redo, tree, undo],
  );

  const pageTitle = titleText(tree);

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="mb-8 min-h-12 break-words text-5xl font-bold leading-tight outline-none empty:before:text-zinc-300 empty:before:content-['Sem_título']"
          onInput={(event: FormEvent<HTMLHeadingElement>) => updateTitle(event.currentTarget.textContent ?? "")}
          onBlur={() => undoRef.current.breakCoalescing()}
          onKeyDown={handleTitleKeyDown}
        >
          {pageTitle}
        </h1>
        <BlockEditor
          tree={tree}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          selectedBlockId={selectedBlockId}
          onSelectedBlockChange={setSelectedBlockId}
          dispatchBatch={dispatchBatch}
          undo={undo}
          redo={redo}
        />
      </section>
    </main>
  );
}
