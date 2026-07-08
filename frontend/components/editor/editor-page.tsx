"use client"

import type { Operation } from "@/lib/contracts"
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"

import { BlockEditor } from "@/components/editor/BlockEditor"
import {
  applyOperation,
  createPageTree,
  getBlock,
  newBlock,
  type BlockTree,
} from "@/lib/engine/tree"
import { UndoManager } from "@/lib/engine/undo"
import { createId } from "@/lib/id"

function opId() {
  return createId()
}

function createInitialTree(): BlockTree {
  // Ids fixos: o estado inicial renderiza no SSR e no cliente; ids aleatorios
  // divergem entre os dois e quebram a hidratacao do React.
  const page = createPageTree("", "page-root")
  const first = newBlock("paragraph", { text: "" }, "first-paragraph")
  return applyOperation(page, {
    type: "insert_block",
    opId: "op-initial",
    block: first,
    parentId: page.rootId,
    index: 0,
  }).tree
}

function titleText(tree: BlockTree) {
  const value = getBlock(tree, tree.rootId).properties.title
  return typeof value === "string" ? value : ""
}

export function EditorPage() {
  const [tree, setTree] = useState<BlockTree>(() => createInitialTree())
  const undoRef = useRef(new UndoManager())
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const dispatchBatch = useCallback(
    (
      ops: Operation[],
      options?: { coalesceKey?: string; breakCoalescing?: boolean }
    ) => {
      if (options?.breakCoalescing) undoRef.current.breakCoalescing()
      if (ops.length === 0) return
      setTree((current) => {
        let next = current
        const inverse: Operation[] = []
        for (const op of ops) {
          const result = applyOperation(next, op)
          next = result.tree
          inverse.unshift(...result.inverse)
        }
        undoRef.current.record(inverse, options?.coalesceKey)
        return next
      })
    },
    []
  )

  const updateTitle = useCallback(
    (title: string) => {
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: tree.rootId,
            properties: { title },
          },
        ],
        { coalesceKey: "title" }
      )
    },
    [dispatchBatch, tree.rootId]
  )

  const undo = useCallback(() => {
    undoRef.current.breakCoalescing()
    setTree((current) => undoRef.current.undo(current))
  }, [])

  const redo = useCallback(() => {
    undoRef.current.breakCoalescing()
    setTree((current) => undoRef.current.redo(current))
  }, [])

  const toggleCollapsed = useCallback((blockId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }, [])

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLHeadingElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const firstId = getBlock(tree, tree.rootId).content[0]
        const first = firstId
          ? document.querySelector<HTMLElement>(
              `[data-block-id="${firstId}"] [contenteditable="true"]`
            )
          : null
        first?.focus()
      }
    },
    [redo, tree, undo]
  )

  const pageTitle = titleText(tree)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Mesmo contrato do BlockEditor: o título nunca é filho React do
  // contenteditable; o DOM só é escrito quando diverge do estado (undo/redo).
  useLayoutEffect(() => {
    const element = titleRef.current
    if (element && element.textContent !== pageTitle) {
      element.textContent = pageTitle
    }
  }, [pageTitle])

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-[708px] flex-col px-6 py-14 leading-7 md:py-20">
        <h1
          ref={titleRef}
          data-cy="page-title"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="mb-6 min-h-12 text-[40px] leading-tight font-bold break-words outline-none empty:before:text-muted-foreground/40 empty:before:content-['Sem_título']"
          onInput={(event: FormEvent<HTMLHeadingElement>) =>
            updateTitle(event.currentTarget.textContent ?? "")
          }
          onBlur={() => undoRef.current.breakCoalescing()}
          onKeyDown={handleTitleKeyDown}
        />
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
  )
}
