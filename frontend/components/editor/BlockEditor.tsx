"use client"

import type { Block, BlockType, Operation } from "@/lib/contracts"
import {
  KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react"
import { getBlock, newBlock, type BlockTree } from "@/lib/engine/tree"
import {
  blockText,
  isDescendantOf,
  isTextBlock,
  siblingIndex,
  visibleBlocks,
} from "@/lib/editor/tree-view"
import {
  detectMarkdownShortcut,
  removeSlashQuery,
  slashQuery,
} from "@/lib/editor/markdown"
import { createId } from "@/lib/id"
import { filteredSlashItems, SlashMenu } from "./SlashMenu"

type DropPosition = "above" | "below"

interface FocusRequest {
  blockId: string
  offset: number
  forceTextSync?: boolean
}

interface SlashState {
  blockId: string
  query: string
  activeIndex: number
}

interface DropState {
  blockId: string
  position: DropPosition
}

interface BlockEditorProps {
  tree: BlockTree
  collapsed: ReadonlySet<string>
  onToggleCollapsed: (blockId: string) => void
  selectedBlockId: string | null
  onSelectedBlockChange: (blockId: string | null) => void
  dispatchBatch: (
    ops: Operation[],
    options?: { coalesceKey?: string; breakCoalescing?: boolean }
  ) => void
  undo: () => void
  redo: () => void
  /** Abre uma página filha. Sem handler, o bloco `page` vira uma linha inerte. */
  onOpenPage?: (pageId: string) => void
  readOnly?: boolean
}

const LIST_TYPES = new Set<BlockType>([
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
])
const EMPTY_EXIT_TYPES = new Set<BlockType>([
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "callout",
])
const DRAG_HANDLE_DOTS = Array.from({ length: 6 }, (_, index) => index)

function opId() {
  return createId()
}

function getCaretOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0)
    return element.textContent?.length ?? 0
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer))
    return element.textContent?.length ?? 0
  const clone = range.cloneRange()
  clone.selectNodeContents(element)
  clone.setEnd(range.startContainer, range.startOffset)
  return clone.toString().length
}

function setCaretOffset(element: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function setElementText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text
}

function isAtFirstLine(text: string, offset: number) {
  return !text.slice(0, offset).includes("\n")
}

function isAtLastLine(text: string, offset: number) {
  return !text.slice(offset).includes("\n")
}

function blockClasses(type: BlockType) {
  switch (type) {
    case "heading1":
      return "text-3xl font-bold leading-tight"
    case "heading2":
      return "text-2xl font-semibold leading-tight"
    case "heading3":
      return "text-xl font-semibold leading-snug"
    case "quote":
      return "border-l-4 border-border pl-3 italic text-muted-foreground"
    case "code":
      return "min-h-10 rounded-md bg-muted px-3 py-2 font-mono text-sm leading-6 whitespace-pre-wrap"
    case "callout":
      return "rounded-md bg-secondary px-3 py-2 text-secondary-foreground"
    case "divider":
      return "py-3"
    default:
      return "text-base leading-7"
  }
}

function numberedValue(tree: BlockTree, block: Block) {
  if (!block.parentId) return 1
  const parent = getBlock(tree, block.parentId)
  const index = parent.content.indexOf(block.id)
  let count = 1
  for (let i = index - 1; i >= 0; i--) {
    const sibling = getBlock(tree, parent.content[i])
    if (sibling.type !== "numbered_list_item") break
    count += 1
  }
  return count
}

export function BlockEditor({
  tree,
  collapsed,
  onToggleCollapsed,
  selectedBlockId,
  onSelectedBlockChange,
  dispatchBatch,
  undo,
  redo,
  onOpenPage,
  readOnly = false,
}: BlockEditorProps) {
  const workspaceId = getBlock(tree, tree.rootId).workspaceId
  const editableRefs = useRef(new Map<string, HTMLElement>())
  const focusRequestRef = useRef<FocusRequest | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const rows = useMemo(() => visibleBlocks(tree, collapsed), [tree, collapsed])
  const rowById = useMemo(
    () =>
      new Map(
        rows.map((row, index) => [
          row.block.id,
          { ...row, visibleIndex: index },
        ])
      ),
    [rows]
  )

  const setRef = useCallback((blockId: string, element: HTMLElement | null) => {
    if (element) editableRefs.current.set(blockId, element)
    else editableRefs.current.delete(blockId)
  }, [])

  const requestFocus = useCallback((request: FocusRequest) => {
    focusRequestRef.current = request
  }, [])

  // O texto NUNCA é renderizado como filho React do contenteditable: o React
  // reescreveria o text node a cada keystroke e o caret voltaria ao início
  // (era isso que fazia a digitação sair invertida). O DOM é a fonte durante a
  // digitação; este efeito só escreve quando estado e DOM divergem — ou seja,
  // em mudanças externas (undo/redo, conversões, merge/split).
  useLayoutEffect(() => {
    for (const [blockId, element] of editableRefs.current) {
      const block = tree.blocks.get(blockId)
      if (block && isTextBlock(block)) setElementText(element, blockText(block))
    }
  }, [tree])

  useLayoutEffect(() => {
    const request = focusRequestRef.current
    if (!request) return
    const element = editableRefs.current.get(request.blockId)
    const block = tree.blocks.get(request.blockId)
    if (!element || !block || !isTextBlock(block)) return
    if (request.forceTextSync) setElementText(element, blockText(block))
    element.focus()
    setCaretOffset(element, request.offset)
    focusRequestRef.current = null
  }, [tree])

  const focusVisible = useCallback(
    (blockId: string, offset: number) => {
      const block = tree.blocks.get(blockId)
      if (!block || !isTextBlock(block)) return
      requestFocus({ blockId, offset, forceTextSync: true })
    },
    [requestFocus, tree.blocks]
  )

  const insertSibling = useCallback(
    (block: Block, type: BlockType, text = "") => {
      if (!block.parentId) return null
      const parent = getBlock(tree, block.parentId)
      const index = parent.content.indexOf(block.id)
      const fresh = newBlock(
        type,
        type === "to_do" ? { text, checked: false } : { text },
        createId(),
        workspaceId
      )
      return {
        op: {
          type: "insert_block",
          opId: opId(),
          block: fresh,
          parentId: parent.id,
          index: index + 1,
        } satisfies Operation,
        blockId: fresh.id,
      }
    },
    [tree, workspaceId]
  )

  const handleInput = useCallback(
    (block: Block, element: HTMLElement) => {
      const text = element.textContent ?? ""
      const caret = getCaretOffset(element)
      const shortcut = detectMarkdownShortcut(text, caret)
      if (shortcut) {
        if (shortcut.replacesBlock) {
          dispatchBatch(
            [
              {
                type: "update_block",
                opId: opId(),
                blockId: block.id,
                blockType: "divider",
                properties: { text: null, checked: null },
              },
            ],
            { breakCoalescing: true }
          )
          onSelectedBlockChange(block.id)
          setSlash(null)
          return
        }
        requestFocus({
          blockId: block.id,
          offset: shortcut.text.length,
          forceTextSync: true,
        })
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              blockType: shortcut.blockType,
              properties: {
                text: shortcut.text,
                checked: shortcut.blockType === "to_do" ? false : null,
              },
            },
          ],
          { breakCoalescing: true }
        )
        setSlash(null)
        return
      }

      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: block.id,
            properties: { text },
          },
        ],
        {
          coalesceKey: `text:${block.id}`,
        }
      )
      const query = slashQuery(text, caret)
      setSlash(
        query === null ? null : { blockId: block.id, query, activeIndex: 0 }
      )
    },
    [dispatchBatch, onSelectedBlockChange, requestFocus]
  )

  const splitBlock = useCallback(
    (block: Block, caret: number) => {
      if (!block.parentId) return
      const text = blockText(block)
      if (text.length === 0 && EMPTY_EXIT_TYPES.has(block.type)) {
        requestFocus({ blockId: block.id, offset: 0, forceTextSync: true })
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              blockType: "paragraph",
              properties: { checked: null },
            },
          ],
          { breakCoalescing: true }
        )
        return
      }
      const nextType = LIST_TYPES.has(block.type) ? block.type : "paragraph"
      const next = insertSibling(block, nextType, text.slice(caret))
      if (!next) return
      requestFocus({ blockId: next.blockId, offset: 0, forceTextSync: true })
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: block.id,
            properties: { text: text.slice(0, caret) },
          },
          next.op,
        ],
        { breakCoalescing: true }
      )
      setSlash(null)
    },
    [dispatchBatch, insertSibling, requestFocus]
  )

  const exitCodeBlock = useCallback(
    (block: Block) => {
      const next = insertSibling(block, "paragraph", "")
      if (!next) return
      requestFocus({ blockId: next.blockId, offset: 0, forceTextSync: true })
      dispatchBatch([next.op], { breakCoalescing: true })
    },
    [dispatchBatch, insertSibling, requestFocus]
  )

  const mergeBackward = useCallback(
    (block: Block) => {
      if (!block.parentId) return
      const text = blockText(block)
      if (text.length === 0 && block.type !== "paragraph") {
        requestFocus({ blockId: block.id, offset: 0, forceTextSync: true })
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              blockType: "paragraph",
              properties: { checked: null },
            },
          ],
          { breakCoalescing: true }
        )
        return
      }
      const row = rowById.get(block.id)
      if (!row || row.visibleIndex === 0) return
      const previous = rows[row.visibleIndex - 1].block
      if (previous.type === "divider") {
        dispatchBatch(
          [{ type: "delete_block", opId: opId(), blockId: previous.id }],
          { breakCoalescing: true }
        )
        requestFocus({ blockId: block.id, offset: 0, forceTextSync: true })
        return
      }
      if (!isTextBlock(previous)) return
      const seam = blockText(previous).length
      requestFocus({ blockId: previous.id, offset: seam, forceTextSync: true })
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: previous.id,
            properties: { text: blockText(previous) + text },
          },
          { type: "delete_block", opId: opId(), blockId: block.id },
        ],
        { breakCoalescing: true }
      )
    },
    [dispatchBatch, requestFocus, rowById, rows]
  )

  const indentBlock = useCallback(
    (block: Block) => {
      if (!block.parentId) return
      const parent = getBlock(tree, block.parentId)
      const index = parent.content.indexOf(block.id)
      if (index <= 0) return
      const previousSiblingId = parent.content[index - 1]
      const previousSibling = getBlock(tree, previousSiblingId)
      dispatchBatch(
        [
          {
            type: "move_block",
            opId: opId(),
            blockId: block.id,
            newParentId: previousSibling.id,
            index: previousSibling.content.length,
          },
        ],
        { breakCoalescing: true }
      )
      focusVisible(block.id, blockText(block).length)
    },
    [dispatchBatch, focusVisible, tree]
  )

  const outdentBlock = useCallback(
    (block: Block) => {
      if (!block.parentId) return
      const parent = getBlock(tree, block.parentId)
      if (!parent.parentId) return
      const grand = getBlock(tree, parent.parentId)
      dispatchBatch(
        [
          {
            type: "move_block",
            opId: opId(),
            blockId: block.id,
            newParentId: grand.id,
            index: grand.content.indexOf(parent.id) + 1,
          },
        ],
        { breakCoalescing: true }
      )
      focusVisible(block.id, blockText(block).length)
    },
    [dispatchBatch, focusVisible, tree]
  )

  const selectSlashType = useCallback(
    (type: BlockType) => {
      if (!slash) return
      const block = getBlock(tree, slash.blockId)
      const element = editableRefs.current.get(block.id)
      const caret = element ? getCaretOffset(element) : blockText(block).length
      const removal = removeSlashQuery(
        element?.textContent ?? blockText(block),
        caret
      )
      const nextText = removal?.text ?? blockText(block)
      setSlash(null)

      if (type === "divider") {
        const divider = insertSibling(block, "divider", "")
        if (!divider) return
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              properties: { text: nextText },
            },
            { ...divider.op, block: { ...divider.op.block, properties: {} } },
          ],
          { breakCoalescing: true }
        )
        onSelectedBlockChange(divider.blockId)
        return
      }

      requestFocus({
        blockId: block.id,
        offset: removal?.slashIndex ?? nextText.length,
        forceTextSync: true,
      })
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: block.id,
            blockType: type,
            properties: {
              text: nextText,
              checked: type === "to_do" ? false : null,
            },
          },
        ],
        { breakCoalescing: true }
      )
    },
    [
      dispatchBatch,
      insertSibling,
      onSelectedBlockChange,
      requestFocus,
      slash,
      tree,
    ]
  )

  const moveFocus = useCallback(
    (fromBlockId: string, direction: -1 | 1) => {
      const row = rowById.get(fromBlockId)
      if (!row) return
      const next = rows[row.visibleIndex + direction]?.block
      if (!next || !isTextBlock(next)) return
      requestFocus({
        blockId: next.id,
        offset: direction === -1 ? blockText(next).length : 0,
      })
    },
    [requestFocus, rowById, rows]
  )

  const handleKeyDown = useCallback(
    (block: Block, event: KeyboardEvent<HTMLElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        setSlash(null)
        requestFocus({
          blockId: block.id,
          offset: Math.min(
            getCaretOffset(event.currentTarget),
            blockText(block).length
          ),
          forceTextSync: true,
        })
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if (slash?.blockId === block.id) {
        const itemCount = filteredSlashItems(slash.query).length
        if (event.key === "ArrowDown") {
          event.preventDefault()
          setSlash({
            ...slash,
            activeIndex:
              itemCount === 0 ? 0 : (slash.activeIndex + 1) % itemCount,
          })
          return
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          setSlash({
            ...slash,
            activeIndex:
              itemCount === 0
                ? 0
                : (slash.activeIndex - 1 + itemCount) % itemCount,
          })
          return
        }
        if (event.key === "Enter" && itemCount > 0) {
          event.preventDefault()
          selectSlashType(
            filteredSlashItems(slash.query)[slash.activeIndex]?.type ??
              "paragraph"
          )
          return
        }
        if (event.key === "Escape") {
          event.preventDefault()
          setSlash(null)
          return
        }
      }

      const caret = getCaretOffset(event.currentTarget)
      if (block.type === "code" && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        const text = blockText(block)
        requestFocus({
          blockId: block.id,
          offset: caret + 1,
          forceTextSync: true,
        })
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              properties: {
                text: `${text.slice(0, caret)}\n${text.slice(caret)}`,
              },
            },
          ],
          {
            coalesceKey: `text:${block.id}`,
          }
        )
        return
      }
      if (
        block.type === "code" &&
        (event.key === "Escape" || (event.key === "Enter" && event.shiftKey))
      ) {
        event.preventDefault()
        exitCodeBlock(block)
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        splitBlock(block, caret)
        return
      }
      if (event.key === "Backspace" && caret === 0) {
        event.preventDefault()
        mergeBackward(block)
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        if (event.shiftKey) outdentBlock(block)
        else indentBlock(block)
        return
      }
      if (event.key === "ArrowUp" && isAtFirstLine(blockText(block), caret)) {
        event.preventDefault()
        moveFocus(block.id, -1)
        return
      }
      if (event.key === "ArrowDown" && isAtLastLine(blockText(block), caret)) {
        event.preventDefault()
        moveFocus(block.id, 1)
      }
    },
    [
      dispatchBatch,
      exitCodeBlock,
      indentBlock,
      mergeBackward,
      moveFocus,
      outdentBlock,
      redo,
      requestFocus,
      selectSlashType,
      slash,
      splitBlock,
      undo,
    ]
  )

  const handleDragOver = useCallback(
    (event: DragEvent, block: Block) => {
      if (
        !draggingId ||
        draggingId === block.id ||
        isDescendantOf(tree, block.id, draggingId)
      )
        return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      setDrop({
        blockId: block.id,
        position:
          event.clientY < rect.top + rect.height / 2 ? "above" : "below",
      })
    },
    [draggingId, tree]
  )

  const handleDrop = useCallback(
    (event: DragEvent, target: Block) => {
      event.preventDefault()
      if (!draggingId || !drop || draggingId === target.id || !target.parentId)
        return
      if (isDescendantOf(tree, target.id, draggingId)) return
      const dragged = getBlock(tree, draggingId)
      const targetParent = getBlock(tree, target.parentId)
      const rawIndex =
        targetParent.content.indexOf(target.id) +
        (drop.position === "below" ? 1 : 0)
      const oldIndex = siblingIndex(tree, dragged)
      const adjustedIndex =
        dragged.parentId === targetParent.id && oldIndex < rawIndex
          ? rawIndex - 1
          : rawIndex
      setDraggingId(null)
      setDrop(null)
      if (dragged.parentId === targetParent.id && oldIndex === adjustedIndex)
        return
      dispatchBatch(
        [
          {
            type: "move_block",
            opId: opId(),
            blockId: draggingId,
            newParentId: targetParent.id,
            index: adjustedIndex,
          },
        ],
        { breakCoalescing: true }
      )
      focusVisible(
        draggingId,
        isTextBlock(dragged) ? blockText(dragged).length : 0
      )
    },
    [dispatchBatch, draggingId, drop, focusVisible, tree]
  )

  const renderBlock = (block: Block, depth: number): React.ReactNode => {
    const isFocused = focusedBlockId === block.id
    const text = blockText(block)
    const showPlaceholder =
      block.type === "paragraph" && isFocused && text.length === 0
    const blockSlash = slash?.blockId === block.id ? slash : null
    const isCollapsed = collapsed.has(block.id)
    const children = getBlock(tree, block.id).content.map((childId) =>
      getBlock(tree, childId)
    )
    const checked = block.properties.checked === true

    return (
      <div
        key={block.id}
        className="relative"
        style={{ paddingLeft: depth > 0 ? 24 : 0 }}
      >
        {drop?.blockId === block.id && drop.position === "above" ? (
          <div className="h-0.5 rounded bg-primary" />
        ) : null}
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          draggable={false}
          onDragOver={(event) => handleDragOver(event, block)}
          onDrop={(event) => handleDrop(event, block)}
          className={`group relative rounded px-8 py-0.5 transition-colors hover:bg-muted/40 ${
            selectedBlockId === block.id ? "bg-muted/40" : ""
          }`}
        >
          <button
            type="button"
            draggable={!readOnly}
            aria-label="Arrastar bloco"
            className="pointer-events-none absolute top-1/2 -left-7 flex h-7 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-md text-muted-foreground/35 opacity-0 transition-[background,color,opacity] group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-muted hover:text-muted-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:cursor-grabbing"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData("text/plain", block.id)
              setDraggingId(block.id)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDrop(null)
            }}
          >
            <span
              aria-hidden="true"
              className="grid grid-cols-2 gap-x-0.5 gap-y-0.5"
            >
              {DRAG_HANDLE_DOTS.map((dot) => (
                <span
                  key={dot}
                  data-drag-handle-dot
                  className="size-1 rounded-full bg-current"
                />
              ))}
            </span>
          </button>

          {block.type === "page" ? (
            // Uma página dentro de outra é um link, nunca conteúdo expandido:
            // é o servidor que decide onde a subárvore da filha começa.
            <button
              type="button"
              data-cy={`page-link-${block.id}`}
              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-base leading-7 font-medium underline-offset-4 hover:underline"
              onClick={() => onOpenPage?.(block.id)}
            >
              <span aria-hidden="true" className="shrink-0 text-base leading-none">
                {typeof block.properties.icon === "string" &&
                block.properties.icon.length > 0
                  ? block.properties.icon
                  : "📄"}
              </span>
              <span className="truncate">
                {typeof block.properties.title === "string" &&
                block.properties.title.length > 0
                  ? block.properties.title
                  : "Sem título"}
              </span>
            </button>
          ) : block.type === "divider" ? (
            <div
              tabIndex={0}
              className={blockClasses(block.type)}
              onClick={() => onSelectedBlockChange(block.id)}
              onKeyDown={(event) => {
                if (readOnly) return
                if (event.key === "Backspace") {
                  event.preventDefault()
                  dispatchBatch(
                    [{ type: "delete_block", opId: opId(), blockId: block.id }],
                    { breakCoalescing: true }
                  )
                }
              }}
            >
              <hr className="border-border" />
            </div>
          ) : (
            <div className="relative flex items-start gap-2">
              {block.type === "bulleted_list_item" ? (
                <span className="mt-1.5 w-4 text-center text-muted-foreground">•</span>
              ) : null}
              {block.type === "numbered_list_item" ? (
                <span className="mt-0.5 w-6 text-right text-muted-foreground">
                  {numberedValue(tree, block)}.
                </span>
              ) : null}
              {block.type === "to_do" ? (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={readOnly}
                  className="mt-2 h-4 w-4 accent-primary"
                  onChange={(event) =>
                    dispatchBatch(
                      [
                        {
                          type: "update_block",
                          opId: opId(),
                          blockId: block.id,
                          properties: { checked: event.currentTarget.checked },
                        },
                      ],
                      { breakCoalescing: true }
                    )
                  }
                />
              ) : null}
              {block.type === "toggle" ? (
                <button
                  type="button"
                  aria-label="Alternar filhos"
                  className={`mt-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-transform hover:bg-muted ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onToggleCollapsed(block.id)}
                >
                  ▸
                </button>
              ) : null}
              {block.type === "callout" ? (
                <span className="mt-1 text-base">💡</span>
              ) : null}
              <div className="relative min-w-0 flex-1">
                {showPlaceholder ? (
                  <span className="pointer-events-none absolute top-0 left-0 text-muted-foreground/60">
                    Escreva algo, ou tecle &apos;/&apos; para comandos
                  </span>
                ) : null}
                <div
                  ref={(element) => setRef(block.id, element)}
                  contentEditable={!readOnly}
                  suppressContentEditableWarning
                  spellCheck={block.type !== "code"}
                  className={`min-h-7 w-full break-words outline-none ${blockClasses(block.type)} ${
                    checked ? "text-muted-foreground line-through" : ""
                  }`}
                  onFocus={() => {
                    setFocusedBlockId(block.id)
                    onSelectedBlockChange(block.id)
                  }}
                  onBlur={() => {
                    setFocusedBlockId((current) =>
                      current === block.id ? null : current
                    )
                    dispatchBatch([], { breakCoalescing: true })
                  }}
                  onInput={(event: FormEvent<HTMLElement>) =>
                    handleInput(block, event.currentTarget)
                  }
                  onKeyDown={(event) => handleKeyDown(block, event)}
                />
                {blockSlash ? (
                  <SlashMenu
                    query={blockSlash.query}
                    activeIndex={blockSlash.activeIndex}
                    onHover={(activeIndex) =>
                      setSlash({ ...blockSlash, activeIndex })
                    }
                    onSelect={selectSlashType}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
        {drop?.blockId === block.id && drop.position === "below" ? (
          <div className="h-0.5 rounded bg-primary" />
        ) : null}
        {block.type === "toggle" && isCollapsed
          ? null
          : children.map((child) => renderBlock(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {getBlock(tree, tree.rootId).content.map((childId) =>
        renderBlock(getBlock(tree, childId), 0)
      )}
    </div>
  )
}
