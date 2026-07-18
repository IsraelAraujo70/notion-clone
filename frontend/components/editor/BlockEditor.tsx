"use client"

import type { Block, BlockType, Operation } from "@reason/core/contracts"
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { getBlock, newBlock, type BlockTree } from "@reason/core/engine/tree"
import {
  blockText,
  isDescendantOf,
  isTextBlock,
  visibleBlocks,
} from "@/lib/editor/tree-view"
import {
  detectMarkdownShortcut,
  isStructuredMarkdownPaste,
  MAX_MARKDOWN_PASTE_BLOCKS,
  MAX_MARKDOWN_PASTE_CHARS,
  parseMarkdownBlocks,
  removeSlashQuery,
  slashQuery,
} from "@/lib/editor/markdown"
import { createId } from "@reason/core/id"
import {
  hasInlineMarkdown,
  parseInlineMarkdown,
} from "@reason/core/inline-markdown"
import type { PresencePeer } from "@/lib/api"
import { CodeBlockEditor, type CodeBlockEditorHandle } from "./CodeBlockEditor"
import {
  MermaidBlockEditor,
  type MermaidBlockEditorHandle,
} from "./MermaidBlockEditor"
import { filteredSlashItems, SlashMenu, useSlashItems } from "./SlashMenu"
import { InlineMarkdown } from "./inline-markdown"
import { BlockPresenceAvatar } from "./presence-avatars"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  hasNativeTextSelection,
  intersectsSelectionRect,
  normalizeSelectedRoots,
  planMultiBlockMove,
  rangeSelection,
  type SelectionRect,
} from "@/lib/editor/block-selection"
import {
  CROSS_BLOCK_MARKDOWN_MIME,
  createClipboardInsertOperations,
  clearFallbackBlockClipboard,
  crossBlockSelectionMarkdown,
  currentFallbackBlockClipboard,
  fallbackBlockClipboard,
  isRecoverableBlockClipboard,
  readClipboardEvent,
  serializeBlocks,
  writeClipboardEvent,
  writeNavigatorClipboard,
} from "@/lib/editor/block-clipboard"
import {
  BlockContextOptionsContent,
  BlockDropdownOptionsContent,
  type BlockMenuAction,
} from "./block-options-menu"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { toast } from "sonner"
import { useCrossBlockTextSelection } from "./useCrossBlockTextSelection"

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

interface MarqueeGesture {
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
  additive: boolean
  baseSelection: ReadonlySet<string>
}

interface BlockEditorProps {
  tree: BlockTree
  collapsed: ReadonlySet<string>
  onToggleCollapsed: (blockId: string) => void
  selectedBlockId: string | null
  onSelectedBlockChange: (blockId: string | null) => void
  /** Multi-selection in visible document order. */
  onSelectedBlockIdsChange?: (blockIds: string[]) => void
  onFocusedBlockChange?: (blockId: string | null) => void
  onAiAction?: (
    action: "continue_writing" | "transform_selection",
    blockIds: string[]
  ) => void
  dispatchBatch: (
    ops: Operation[],
    options?: { coalesceKey?: string; breakCoalescing?: boolean }
  ) => void
  undo: () => void
  redo: () => void
  /** Abre uma página filha. Sem handler, o bloco `page` vira uma linha inerte. */
  onOpenPage?: (pageId: string) => void
  readOnly?: boolean
  blockPresence?: Map<string, PresencePeer[]>
  /** Upload de imagem (presign + PUT). Devolve URL pública e key. */
  onUploadImage?: (file: File) => Promise<{ url: string; key: string }>
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

function getSelectionOffsets(element: HTMLElement) {
  const selection = window.getSelection()
  const length = element.textContent?.length ?? 0
  if (!selection || selection.rangeCount === 0)
    return { start: length, end: length }
  const range = selection.getRangeAt(0)
  if (
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return { start: length, end: length }
  }
  const start = range.cloneRange()
  start.selectNodeContents(element)
  start.setEnd(range.startContainer, range.startOffset)
  const end = range.cloneRange()
  end.selectNodeContents(element)
  end.setEnd(range.endContainer, range.endOffset)
  return { start: start.toString().length, end: end.toString().length }
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
      // Fundo e padding ficam no wrapper (ícone + texto) para a lâmpada
      // ficar no centro vertical do bloco, não flutuando ao lado.
      return "min-h-7 text-secondary-foreground"
    case "divider":
      return "py-3"
    default:
      return "text-base leading-7"
  }
}

function inlinePreviewClasses(type: BlockType) {
  switch (type) {
    case "heading1":
      return "text-3xl font-bold leading-tight"
    case "heading2":
      return "text-2xl font-semibold leading-tight"
    case "heading3":
      return "text-xl font-semibold leading-snug"
    case "quote":
      return "pl-3 italic text-muted-foreground"
    case "callout":
      return "min-h-7 text-secondary-foreground"
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
  onSelectedBlockIdsChange,
  onFocusedBlockChange,
  onAiAction,
  dispatchBatch,
  undo,
  redo,
  onOpenPage,
  readOnly = false,
  blockPresence,
  onUploadImage,
}: BlockEditorProps) {
  const { t } = useI18n()
  const slashItems = useSlashItems()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageTargetBlockRef = useRef<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const workspaceId = getBlock(tree, tree.rootId).workspaceId
  const editableRefs = useRef(new Map<string, HTMLElement>())
  const codeEditorRefs = useRef(new Map<string, CodeBlockEditorHandle>())
  const mermaidEditorRefs = useRef(new Map<string, MermaidBlockEditorHandle>())
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef(tree)
  useCrossBlockTextSelection(containerRef, Boolean(readOnly))
  const focusRequestRef = useRef<FocusRequest | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  // HTML5 DnD lê o estado no mesmo tick do evento; setState ainda não re-renderizou.
  // Refs são a fonte de verdade durante o arrasto; o state só pinta o indicador.
  const draggingIdsRef = useRef<string[]>([])
  const dropRef = useRef<DropState | null>(null)
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [drop, setDrop] = useState<DropState | null>(null)
  const [openHandleMenuId, setOpenHandleMenuId] = useState<string | null>(null)
  const [clipboardReady, setClipboardReady] = useState(
    () => fallbackBlockClipboard() !== null
  )
  // Seleção de vários blocos (arrasto no gutter) + menu de contexto do bloco.
  const [selection, setSelection] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const selectionRef = useRef<ReadonlySet<string>>(new Set())
  const menuTargetIdsRef = useRef<string[]>([])
  const menuCutPendingRef = useRef(false)
  const [menuTargetCount, setMenuTargetCount] = useState(0)
  const menuSelectionRef = useRef<ReadonlySet<string>>(new Set())
  const pendingContextMenuBlockRef = useRef<string | null>(null)
  const menuRestoreFocusRef = useRef<HTMLElement | null>(null)
  const restoringMenuFocusRef = useRef(false)
  const preserveMenuSelectionRef = useRef(false)
  const nativeTextContextBlockRef = useRef<string | null>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const marqueeRef = useRef<MarqueeGesture | null>(null)
  const marqueeFrameRef = useRef<number | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<SelectionRect | null>(null)
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
  const visibleIds = useMemo(() => rows.map((row) => row.block.id), [rows])
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds])

  useLayoutEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (focusedBlockId && !visibleIdSet.has(focusedBlockId)) {
        setFocusedBlockId(null)
      }
      if (selectedBlockId && !visibleIdSet.has(selectedBlockId)) {
        onSelectedBlockChange(null)
      }
      const nextSelection = new Set(
        [...selectionRef.current].filter((id) => visibleIdSet.has(id))
      )
      if (nextSelection.size !== selectionRef.current.size) {
        selectionRef.current = nextSelection
        setSelection(nextSelection)
      }
      if (slash && !visibleIdSet.has(slash.blockId)) setSlash(null)
    })
    return () => {
      active = false
    }
  }, [
    focusedBlockId,
    onSelectedBlockChange,
    selectedBlockId,
    slash,
    visibleIdSet,
  ])

  const setRef = useCallback((blockId: string, element: HTMLElement | null) => {
    if (element) editableRefs.current.set(blockId, element)
    else editableRefs.current.delete(blockId)
  }, [])

  const setCodeEditorRef = useCallback(
    (blockId: string, editor: CodeBlockEditorHandle | null) => {
      if (editor) codeEditorRefs.current.set(blockId, editor)
      else codeEditorRefs.current.delete(blockId)
    },
    []
  )

  const setMermaidEditorRef = useCallback(
    (blockId: string, editor: MermaidBlockEditorHandle | null) => {
      if (editor) mermaidEditorRefs.current.set(blockId, editor)
      else mermaidEditorRefs.current.delete(blockId)
    },
    []
  )

  const requestFocus = useCallback((request: FocusRequest) => {
    focusRequestRef.current = request
  }, [])

  // O texto NUNCA é renderizado como filho React do contenteditable: o React
  // reescreveria o text node a cada keystroke e o caret voltaria ao início
  // (era isso que fazia a digitação sair invertida). O DOM é a fonte durante a
  // digitação; este efeito só escreve quando estado e DOM divergem — ou seja,
  // em mudanças externas (undo/redo, conversões, merge/split).
  // `collapsed` entra nas deps: expandir um toggle remonta os contenteditables
  // dos filhos sem mudar `tree`; sem re-rodar aqui eles voltariam em branco.
  useLayoutEffect(() => {
    for (const [blockId, element] of editableRefs.current) {
      const block = tree.blocks.get(blockId)
      if (block && isTextBlock(block)) setElementText(element, blockText(block))
    }
  }, [tree, collapsed])

  useLayoutEffect(() => {
    const request = focusRequestRef.current
    if (!request) return
    const block = tree.blocks.get(request.blockId)
    if (!block || !isTextBlock(block)) return
    if (block.type === "code" || block.type === "mermaid") {
      const editor =
        block.type === "code"
          ? codeEditorRefs.current.get(request.blockId)
          : mermaidEditorRefs.current.get(request.blockId)
      if (!editor) return
      editor.focus(request.offset)
      focusRequestRef.current = null
      return
    }
    const element = editableRefs.current.get(request.blockId)
    if (!element) return
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
          offset: shortcut.caretOffset,
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
                language: shortcut.blockType === "code" ? "plaintext" : null,
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

  const handleTextPaste = useCallback(
    (
      block: Block,
      element: HTMLElement,
      event: ClipboardEvent<HTMLElement>
    ) => {
      if (
        [...event.clipboardData.files].some((file) =>
          file.type.startsWith("image/")
        )
      ) {
        return
      }
      if (!block.parentId) return
      const parent = getBlock(tree, block.parentId)
      const startIndex = parent.content.indexOf(block.id)
      const structured = readClipboardEvent(event.clipboardData)
      if (structured?.blocks.length) {
        const operations = createClipboardInsertOperations(
          structured,
          parent.id,
          startIndex + 1,
          workspaceId,
          createId
        )
        if (operations.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        const lastRoot = operations
          .filter(
            (operation) =>
              operation.type === "insert_block" &&
              operation.parentId === parent.id
          )
          .at(-1)
        dispatchBatch(operations, { breakCoalescing: true })
        if (lastRoot?.type === "insert_block") {
          const inserted = lastRoot.block
          requestFocus({
            blockId: inserted.id,
            offset: blockText(inserted).length,
            forceTextSync: true,
          })
        }
        return
      }
      const internalMarkdown = event.clipboardData.getData(
        CROSS_BLOCK_MARKDOWN_MIME
      )
      const markdown =
        internalMarkdown || event.clipboardData.getData("text/plain")
      if (
        !markdown ||
        markdown.length > MAX_MARKDOWN_PASTE_CHARS ||
        (!internalMarkdown && !isStructuredMarkdownPaste(markdown))
      )
        return
      const text = blockText(block)
      const selection = getSelectionOffsets(element)
      if (
        text.length > 0 &&
        !(selection.start === 0 && selection.end === text.length)
      ) {
        return
      }
      const drafts = parseMarkdownBlocks(markdown, Boolean(internalMarkdown))
      if (drafts.length === 0 || drafts.length > MAX_MARKDOWN_PASTE_BLOCKS)
        return
      if (drafts.at(-1)?.blockType === "divider") {
        drafts.push({ blockType: "paragraph", properties: { text: "" } })
      }

      event.preventDefault()
      event.stopPropagation()
      const first = drafts[0]
      const operations: Operation[] = [
        {
          type: "update_block",
          opId: opId(),
          blockId: block.id,
          blockType: first.blockType,
          properties: {
            text: null,
            checked: null,
            language: null,
            ...first.properties,
          },
        },
      ]
      let lastBlockId = block.id
      for (const [offset, draft] of drafts.slice(1).entries()) {
        const fresh = newBlock(
          draft.blockType,
          draft.properties,
          createId(),
          workspaceId
        )
        operations.push({
          type: "insert_block",
          opId: opId(),
          block: fresh,
          parentId: parent.id,
          index: startIndex + offset + 1,
        })
        lastBlockId = fresh.id
      }
      const last = drafts.at(-1)!
      requestFocus({
        blockId: lastBlockId,
        offset: String(last.properties.text ?? "").length,
        forceTextSync: true,
      })
      dispatchBatch(operations, { breakCoalescing: true })
      setSlash(null)
    },
    [dispatchBatch, requestFocus, tree, workspaceId]
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

      if (type === "image") {
        dispatchBatch(
          [
            {
              type: "update_block",
              opId: opId(),
              blockId: block.id,
              properties: { text: nextText },
            },
          ],
          { breakCoalescing: true }
        )
        imageTargetBlockRef.current = block.id
        imageInputRef.current?.click()
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
              language: type === "code" ? "plaintext" : null,
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

  const insertImageAfter = useCallback(
    async (afterBlockId: string, file: File) => {
      if (!onUploadImage || readOnly) return
      const after = getBlock(tree, afterBlockId)
      setUploadingImage(true)
      try {
        const { url, key } = await onUploadImage(file)
        const sibling = insertSibling(after, "image", "")
        if (!sibling) return
        dispatchBatch(
          [
            {
              ...sibling.op,
              block: {
                ...sibling.op.block,
                properties: { url, key, caption: "" },
              },
            },
          ],
          { breakCoalescing: true }
        )
        onSelectedBlockChange(sibling.blockId)
      } catch {
        // Caller / UI pode mostrar erro depois; evita quebrar o editor.
      } finally {
        setUploadingImage(false)
      }
    },
    [
      dispatchBatch,
      insertSibling,
      onSelectedBlockChange,
      onUploadImage,
      readOnly,
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
        const itemCount = filteredSlashItems(slash.query, slashItems).length
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
            filteredSlashItems(slash.query, slashItems)[slash.activeIndex]
              ?.type ?? "paragraph"
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
      slashItems,
      splitBlock,
      undo,
    ]
  )

  const clearDrag = useCallback(() => {
    draggingIdsRef.current = []
    dropRef.current = null
    setDraggingIds(new Set())
    setDrop(null)
  }, [])

  const dropPositionFor = useCallback((event: DragEvent): DropPosition => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? "above" : "below"
  }, [])

  const handleDragOver = useCallback(
    (event: DragEvent, block: Block) => {
      const activeIds = draggingIdsRef.current
      if (
        activeIds.length === 0 ||
        activeIds.includes(block.id) ||
        activeIds.some((activeId) => isDescendantOf(tree, block.id, activeId))
      )
        return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      const next: DropState = {
        blockId: block.id,
        position: dropPositionFor(event),
      }
      dropRef.current = next
      setDrop((current) =>
        current?.blockId === next.blockId && current.position === next.position
          ? current
          : next
      )
    },
    [dropPositionFor, tree]
  )

  const handleDrop = useCallback(
    (event: DragEvent, target: Block) => {
      event.preventDefault()
      event.stopPropagation()
      const activeIds = draggingIdsRef.current
      if (activeIds.length === 0 || !target.parentId) {
        clearDrag()
        return
      }
      const position =
        dropRef.current?.blockId === target.id
          ? dropRef.current.position
          : dropPositionFor(event)
      const operations = planMultiBlockMove(
        tree,
        activeIds,
        visibleIds,
        target.id,
        position,
        opId
      )
      const firstId = activeIds[0]
      const first = tree.blocks.get(firstId)
      clearDrag()
      if (operations.length === 0) return
      dispatchBatch(operations, { breakCoalescing: true })
      if (first) {
        focusVisible(firstId, isTextBlock(first) ? blockText(first).length : 0)
      }
    },
    [clearDrag, dispatchBatch, dropPositionFor, focusVisible, tree, visibleIds]
  )

  const setSelectionBoth = useCallback((next: ReadonlySet<string>) => {
    selectionRef.current = next
    setSelection(next)
  }, [])

  const clearSelection = useCallback(() => {
    if (selectionRef.current.size > 0) setSelectionBoth(new Set())
  }, [setSelectionBoth])

  const selectedRoots = useCallback(
    (ids: Iterable<string> = selectionRef.current) =>
      normalizeSelectedRoots(tree, ids, visibleIds),
    [tree, visibleIds]
  )
  const selectedRootIds = useMemo(
    () => normalizeSelectedRoots(tree, selection, visibleIds),
    [selection, tree, visibleIds]
  )

  const prepareBlockMenu = useCallback(
    (blockId: string) => {
      const current = selectionRef.current
      const target =
        current.size > 0 && current.has(blockId) ? current : new Set([blockId])
      menuSelectionRef.current = target
      const roots = selectedRoots(target)
      menuTargetIdsRef.current = roots
      setMenuTargetCount(roots.length)
      if (target !== current) setSelectionBoth(target)
    },
    [selectedRoots, setSelectionBoth]
  )

  const restoreBlockMenuFocus = useCallback((event: Event) => {
    const target = menuRestoreFocusRef.current
    menuRestoreFocusRef.current = null
    if (!target?.isConnected) return
    event.preventDefault()
    restoringMenuFocusRef.current = true
    try {
      target.focus()
    } finally {
      restoringMenuFocusRef.current = false
    }
  }, [])

  const prepareTextBlockMenu = useCallback(
    (blockId: string, element: HTMLElement) => {
      const useNativeMenu =
        nativeTextContextBlockRef.current === blockId ||
        hasNativeTextSelection(containerRef.current, element)
      if (useNativeMenu) {
        nativeTextContextBlockRef.current = blockId
        pendingContextMenuBlockRef.current = null
        menuRestoreFocusRef.current = null
        return
      }
      nativeTextContextBlockRef.current = null
      preserveMenuSelectionRef.current = true
      pendingContextMenuBlockRef.current = blockId
      prepareBlockMenu(blockId)
      menuRestoreFocusRef.current = element
    },
    [prepareBlockMenu]
  )

  useEffect(() => {
    onSelectedBlockIdsChange?.(selectedRoots(selection))
  }, [onSelectedBlockIdsChange, selectedRoots, selection])

  useEffect(() => {
    onFocusedBlockChange?.(focusedBlockId)
  }, [focusedBlockId, onFocusedBlockChange])

  const deleteBlocks = useCallback(
    (ids: string[]) => {
      const roots = selectedRoots(ids)
      const ops = roots.map(
        (id) =>
          ({
            type: "delete_block",
            opId: opId(),
            blockId: id,
          }) satisfies Operation
      )
      if (ops.length) dispatchBatch(ops, { breakCoalescing: true })
    },
    [dispatchBatch, selectedRoots]
  )

  const runBlockMenu = useCallback(
    async (action: "copy" | "cut" | "delete", ids: string[]) => {
      if (action === "delete") {
        deleteBlocks(ids)
        clearSelection()
        return
      }

      const roots = selectedRoots(ids)
      const payload = serializeBlocks(tree, roots)
      if (action === "cut") {
        if (menuCutPendingRef.current) return
        if (!isRecoverableBlockClipboard(payload)) {
          toast.error(t("Could not cut the blocks. They were not deleted."))
          return
        }
        menuCutPendingRef.current = true
      }

      try {
        const result = await writeNavigatorClipboard(payload)
        setClipboardReady(true)
        if (action === "copy") return
        if (result !== "structured") {
          toast.error(t("Could not cut the blocks. They were not deleted."))
          return
        }
        const currentPayload = serializeBlocks(treeRef.current, roots)
        if (JSON.stringify(currentPayload) !== JSON.stringify(payload)) {
          toast.error(
            t(
              "The blocks changed before they could be cut. They were not deleted."
            )
          )
          return
        }
        deleteBlocks(roots)
        clearSelection()
      } catch {
        if (action === "cut")
          toast.error(t("Could not cut the blocks. They were not deleted."))
      } finally {
        if (action === "cut") menuCutPendingRef.current = false
      }
    },
    [clearSelection, deleteBlocks, selectedRoots, t, tree]
  )

  const duplicateSelectedBlocks = useCallback(() => {
    const roots = selectedRoots(menuTargetIdsRef.current)
    const operations: Operation[] = []
    for (const id of [...roots].reverse()) {
      const block = tree.blocks.get(id)
      if (!block?.parentId) continue
      const parent = getBlock(tree, block.parentId)
      operations.push(
        ...createClipboardInsertOperations(
          serializeBlocks(tree, [id]),
          parent.id,
          parent.content.indexOf(id) + 1,
          workspaceId,
          createId
        )
      )
    }
    if (operations.length) dispatchBatch(operations, { breakCoalescing: true })
  }, [dispatchBatch, selectedRoots, tree, workspaceId])

  const pasteSelectedBlocks = useCallback(async () => {
    const payload = await currentFallbackBlockClipboard()
    const anchorId =
      selectedRoots(menuTargetIdsRef.current).at(-1) ??
      selectedBlockId ??
      focusedBlockId
    const anchor = anchorId ? tree.blocks.get(anchorId) : undefined
    if (!payload || !anchor?.parentId) return
    const parent = getBlock(tree, anchor.parentId)
    const operations = createClipboardInsertOperations(
      payload,
      parent.id,
      parent.content.indexOf(anchor.id) + 1,
      workspaceId,
      createId
    )
    if (operations.length) dispatchBatch(operations, { breakCoalescing: true })
  }, [
    dispatchBatch,
    focusedBlockId,
    selectedBlockId,
    selectedRoots,
    tree,
    workspaceId,
  ])

  const turnSelectedInto = useCallback(
    (blockType: BlockType) => {
      const operations = selectedRoots(menuTargetIdsRef.current).flatMap(
        (id) => {
          const block = tree.blocks.get(id)
          if (!block || ["page", "image", "divider"].includes(block.type))
            return []
          return [
            {
              type: "update_block" as const,
              opId: opId(),
              blockId: id,
              blockType,
              properties: {
                text: blockText(block),
                checked:
                  blockType === "to_do"
                    ? block.properties.checked === true
                    : null,
                language:
                  blockType === "code"
                    ? typeof block.properties.language === "string"
                      ? block.properties.language
                      : "plaintext"
                    : null,
              },
            },
          ]
        }
      )
      if (operations.length)
        dispatchBatch(operations, { breakCoalescing: true })
    },
    [dispatchBatch, selectedRoots, tree]
  )

  const runOptionsAction = useCallback(
    (action: BlockMenuAction, blockId: string) => {
      const ids = menuTargetIdsRef.current
      switch (action) {
        case "ai_transform":
          onAiAction?.("transform_selection", ids)
          return
        case "ai_continue":
          onAiAction?.("continue_writing", [blockId])
          return
        case "undo":
          undo()
          return
        case "redo":
          redo()
          return
        case "copy":
        case "cut":
        case "delete":
          void runBlockMenu(action, ids)
          return
        case "paste":
          void pasteSelectedBlocks()
          return
        case "duplicate":
          duplicateSelectedBlocks()
          return
        case "select_all":
          setSelectionBoth(new Set(visibleIds))
      }
    },
    [
      duplicateSelectedBlocks,
      onAiAction,
      pasteSelectedBlocks,
      redo,
      runBlockMenu,
      setSelectionBoth,
      undo,
      visibleIds,
    ]
  )

  const marqueeTickRef = useRef<() => void>(() => {})
  const updateMarquee = useCallback(() => {
    marqueeFrameRef.current = null
    const gesture = marqueeRef.current
    const container = containerRef.current
    if (!gesture?.active || !container) return
    const rect: SelectionRect = {
      left: Math.min(gesture.startX, gesture.currentX),
      right: Math.max(gesture.startX, gesture.currentX),
      top: Math.min(gesture.startY, gesture.currentY),
      bottom: Math.max(gesture.startY, gesture.currentY),
    }
    setMarqueeRect(rect)
    const selected = new Set(gesture.baseSelection)
    container
      .querySelectorAll<HTMLElement>("[data-block-id]")
      .forEach((node) => {
        const id = node.dataset.blockId
        if (id && intersectsSelectionRect(rect, node.getBoundingClientRect())) {
          selected.add(id)
        }
      })
    setSelectionBoth(selected)

    const edge = 48
    const speed =
      gesture.currentY < edge
        ? -Math.ceil((edge - gesture.currentY) / 6)
        : gesture.currentY > window.innerHeight - edge
          ? Math.ceil((gesture.currentY - (window.innerHeight - edge)) / 6)
          : 0
    if (speed !== 0) {
      window.scrollBy(0, Math.max(-16, Math.min(16, speed)))
      marqueeFrameRef.current = requestAnimationFrame(() =>
        marqueeTickRef.current()
      )
    }
  }, [setSelectionBoth])
  useEffect(() => {
    marqueeTickRef.current = updateMarquee
  }, [updateMarquee])

  const scheduleMarquee = useCallback(() => {
    if (marqueeFrameRef.current === null) {
      marqueeFrameRef.current = requestAnimationFrame(() =>
        marqueeTickRef.current()
      )
    }
  }, [])

  const handleContainerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.pointerType === "touch") return
      const target = event.target as HTMLElement
      if (!event.currentTarget.contains(target)) return
      if (
        target.closest('[contenteditable="true"]') ||
        target.closest(".cm-editor") ||
        target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("select") ||
        target.closest("img") ||
        target.closest("a") ||
        target.closest('[data-block-handle="true"]')
      ) {
        return
      }
      const additive = event.metaKey || event.ctrlKey || event.shiftKey
      marqueeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        active: false,
        additive,
        baseSelection: additive ? selectionRef.current : new Set(),
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    []
  )

  const handleContainerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = marqueeRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      gesture.currentX = event.clientX
      gesture.currentY = event.clientY
      if (!gesture.active) {
        if (
          Math.hypot(
            gesture.currentX - gesture.startX,
            gesture.currentY - gesture.startY
          ) < 5
        )
          return
        gesture.active = true
        window.getSelection()?.removeAllRanges()
      }
      event.preventDefault()
      scheduleMarquee()
    },
    [scheduleMarquee]
  )

  const finishMarquee = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = marqueeRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      if (!gesture.active && !gesture.additive) clearSelection()
      marqueeRef.current = null
      setMarqueeRect(null)
      if (marqueeFrameRef.current !== null) {
        cancelAnimationFrame(marqueeFrameRef.current)
        marqueeFrameRef.current = null
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [clearSelection]
  )

  useEffect(
    () => () => {
      if (marqueeFrameRef.current !== null) {
        cancelAnimationFrame(marqueeFrameRef.current)
      }
    },
    []
  )

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (selectionRef.current.size === 0) return
      const target = event.target as HTMLElement | null
      const container = containerRef.current
      const belongsToEditor =
        !target ||
        target === document.body ||
        target === container ||
        Boolean(container?.contains(target))
      if (
        !belongsToEditor ||
        target?.closest("input,textarea,[contenteditable=true],.cm-editor") ||
        hasNativeTextSelection(container)
      )
        return
      if (event.key === "Delete" || event.key === "Backspace") {
        if (readOnly) return
        event.preventDefault()
        deleteBlocks([...selectionRef.current])
        clearSelection()
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault()
        setSelectionBoth(new Set(visibleIds))
      } else if (event.key === "Escape") {
        clearSelection()
      }
    }
    const onCopy = (
      event: globalThis.ClipboardEvent,
      requireRecoverable = false
    ) => {
      const target = event.target
      const container = containerRef.current
      const selection = window.getSelection()
      const nativeSelectionExists = Boolean(selection && !selection.isCollapsed)
      const outsideEditor =
        target instanceof Node &&
        target !== document &&
        target !== document.body &&
        target !== container &&
        !container?.contains(target)
      const crossBlockMarkdown =
        event.type === "copy"
          ? crossBlockSelectionMarkdown(container, rows, selection)
          : null
      if (
        !outsideEditor &&
        event.clipboardData &&
        crossBlockMarkdown !== null
      ) {
        event.preventDefault()
        clearFallbackBlockClipboard()
        try {
          event.clipboardData.setData(
            CROSS_BLOCK_MARKDOWN_MIME,
            crossBlockMarkdown
          )
        } catch {
          // text/plain remains valid Markdown for external applications.
        }
        event.clipboardData.setData("text/plain", crossBlockMarkdown)
        return
      }
      if (
        selectionRef.current.size === 0 ||
        nativeSelectionExists ||
        outsideEditor
      )
        return
      if (!event.clipboardData) return false
      const payload = serializeBlocks(tree, selectedRoots())
      if (requireRecoverable && !isRecoverableBlockClipboard(payload))
        return false
      let result: ReturnType<typeof writeClipboardEvent>
      try {
        result = writeClipboardEvent(event.clipboardData, payload)
      } catch {
        return false
      }
      event.preventDefault()
      setClipboardReady(true)
      return result
    }
    const onCut = (event: globalThis.ClipboardEvent) => {
      if (readOnly) return
      const copied = onCopy(event, true)
      if (copied === undefined) return
      if (!copied || copied !== "structured") {
        toast.error(t("Could not cut the blocks. They were not deleted."))
        return
      }
      deleteBlocks(selectedRoots())
      clearSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("copy", onCopy)
    window.addEventListener("cut", onCut)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("copy", onCopy)
      window.removeEventListener("cut", onCut)
    }
  }, [
    clearSelection,
    deleteBlocks,
    readOnly,
    rows,
    selectedRoots,
    setSelectionBoth,
    t,
    tree,
    visibleIds,
  ])

  const handleBlockSelectionPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, blockId: string) => {
      if (
        event.button !== 0 ||
        !(event.metaKey || event.ctrlKey || event.shiftKey)
      )
        return
      const target = event.target as HTMLElement
      if (
        target.closest('[contenteditable="true"]') ||
        target.closest(".cm-editor") ||
        target.closest("input,textarea,select")
      )
        return
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey && selectionAnchorRef.current) {
        const range = rangeSelection(
          visibleIds,
          selectionAnchorRef.current,
          blockId
        )
        const next =
          event.metaKey || event.ctrlKey
            ? new Set(selectionRef.current)
            : new Set<string>()
        range.forEach((id) => next.add(id))
        setSelectionBoth(next)
      } else {
        const next = new Set(selectionRef.current)
        if (next.has(blockId)) next.delete(blockId)
        else next.add(blockId)
        setSelectionBoth(next)
      }
      selectionAnchorRef.current = blockId
    },
    [setSelectionBoth, visibleIds]
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
    const inlineSegments =
      isTextBlock(block) && block.type !== "code" && block.type !== "mermaid"
        ? parseInlineMarkdown(text)
        : []
    const showInlinePreview =
      !readOnly && !isFocused && hasInlineMarkdown(inlineSegments)

    return (
      <div
        key={block.id}
        className="relative"
        style={{ paddingLeft: depth > 0 ? 24 : 0 }}
      >
        {drop?.blockId === block.id && drop.position === "above" ? (
          <div className="h-0.5 rounded bg-primary" />
        ) : null}
        <ContextMenu
          onOpenChange={(open) => {
            if (!open) return
            preserveMenuSelectionRef.current = true
            if (pendingContextMenuBlockRef.current === block.id) {
              pendingContextMenuBlockRef.current = null
              setSelectionBoth(new Set(menuSelectionRef.current))
            } else {
              prepareBlockMenu(block.id)
            }
          }}
        >
          <ContextMenuTrigger asChild>
            <div
              data-block-id={block.id}
              data-block-type={block.type}
              draggable={false}
              onDragOver={(event) => handleDragOver(event, block)}
              onDrop={(event) => handleDrop(event, block)}
              onPointerDown={(event) =>
                handleBlockSelectionPointerDown(event, block.id)
              }
              onPointerDownCapture={(event) => {
                if (
                  event.button !== 2 ||
                  (event.target as HTMLElement).closest(
                    '[contenteditable="true"]'
                  )
                )
                  return
                pendingContextMenuBlockRef.current = block.id
                prepareBlockMenu(block.id)
                menuRestoreFocusRef.current =
                  (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-block-handle="true"]'
                  ) ??
                  event.currentTarget.querySelector<HTMLElement>(
                    '[contenteditable="true"],button,[tabindex]'
                  )
              }}
              className={`group relative rounded py-1.5 pr-3 pl-9 transition-colors ${
                draggingIds.has(block.id)
                  ? "opacity-40"
                  : selection.has(block.id)
                    ? "bg-primary/15"
                    : selectedBlockId === block.id
                      ? "bg-muted/40"
                      : "hover:bg-muted/40"
              }`}
            >
              <BlockPresenceAvatar peers={blockPresence?.get(block.id) ?? []} />
              <DropdownMenu
                open={openHandleMenuId === block.id}
                onOpenChange={(open) => {
                  // Radix pede abertura no pointerdown. Ignoramos esse pedido para
                  // não abrir o menu durante drag; click/teclado abrem abaixo.
                  if (!open) setOpenHandleMenuId(null)
                }}
              >
                <DropdownMenuTrigger asChild>
                  <span
                    aria-hidden="true"
                    tabIndex={-1}
                    className="pointer-events-none absolute top-1/2 left-0.5 h-8 w-7 -translate-y-1/2 opacity-0"
                  />
                </DropdownMenuTrigger>
                <span
                  role="button"
                  tabIndex={0}
                  draggable={!readOnly}
                  aria-label={t("Drag or open block options")}
                  data-block-handle="true"
                  data-cy={`block-handle-${block.id}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    prepareBlockMenu(block.id)
                    setOpenHandleMenuId(block.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    prepareBlockMenu(block.id)
                    setOpenHandleMenuId(block.id)
                  }}
                  className={`pointer-events-none absolute top-1/2 left-0.5 z-10 flex h-8 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-[background,color,opacity] select-none group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-muted hover:text-muted-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100 ${
                    readOnly ? "" : "cursor-grab active:cursor-grabbing"
                  } ${draggingIds.has(block.id) ? "opacity-100" : ""}`}
                  onDragStart={(event) => {
                    if (readOnly) {
                      event.preventDefault()
                      return
                    }
                    setOpenHandleMenuId(null)
                    marqueeRef.current = null
                    setMarqueeRect(null)
                    const selected = selectionRef.current
                    const ids = selected.has(block.id)
                      ? selectedRoots(selected)
                      : [block.id]
                    if (!selected.has(block.id)) {
                      setSelectionBoth(new Set(ids))
                    }
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", ids.join("\n"))
                    event.dataTransfer.setData(
                      "application/x-notion-block",
                      JSON.stringify(ids)
                    )
                    draggingIdsRef.current = ids
                    dropRef.current = null
                    requestAnimationFrame(() => {
                      if (!draggingIdsRef.current.includes(block.id)) return
                      setDraggingIds(new Set(ids))
                      setDrop(null)
                    })
                  }}
                  onDragEnd={clearDrag}
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
                </span>
                <BlockDropdownOptionsContent
                  count={Math.max(1, selectedRootIds.length)}
                  canWrite={!readOnly}
                  canContinue={!readOnly && selectedRootIds.length === 1}
                  canPaste={clipboardReady}
                  onAction={(action) => runOptionsAction(action, block.id)}
                  onTurnInto={turnSelectedInto}
                />
              </DropdownMenu>

              {block.type === "page" ? (
                // Uma página dentro de outra é um link, nunca conteúdo expandido:
                // é o servidor que decide onde a subárvore da filha começa.
                <button
                  type="button"
                  data-cy={`page-link-${block.id}`}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-base leading-7 font-medium underline-offset-4 hover:underline"
                  onClick={() => onOpenPage?.(block.id)}
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-base leading-none"
                  >
                    {typeof block.properties.icon === "string" &&
                    block.properties.icon.length > 0
                      ? block.properties.icon
                      : "📄"}
                  </span>
                  <span className="truncate">
                    {typeof block.properties.title === "string" &&
                    block.properties.title.length > 0
                      ? block.properties.title
                      : t("Untitled")}
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
                        [
                          {
                            type: "delete_block",
                            opId: opId(),
                            blockId: block.id,
                          },
                        ],
                        { breakCoalescing: true }
                      )
                    }
                  }}
                >
                  <hr className="border-border" />
                </div>
              ) : block.type === "image" ? (
                <div
                  tabIndex={0}
                  data-cy={`image-block-${block.id}`}
                  className="flex flex-col gap-2 py-1"
                  onClick={() => onSelectedBlockChange(block.id)}
                  onKeyDown={(event) => {
                    if (readOnly) return
                    if (event.key === "Backspace" || event.key === "Delete") {
                      event.preventDefault()
                      dispatchBatch(
                        [
                          {
                            type: "delete_block",
                            opId: opId(),
                            blockId: block.id,
                          },
                        ],
                        { breakCoalescing: true }
                      )
                    }
                  }}
                >
                  {typeof block.properties.url === "string" &&
                  block.properties.url.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={block.properties.url}
                      alt={
                        typeof block.properties.caption === "string"
                          ? block.properties.caption
                          : t("Image")
                      }
                      className="max-h-[min(70vh,720px)] w-full rounded-md border bg-muted/30 object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      {t("Image has no URL")}
                    </div>
                  )}
                  {!readOnly ? (
                    <input
                      type="text"
                      data-cy={`image-caption-${block.id}`}
                      placeholder={t("Caption (optional)")}
                      value={
                        typeof block.properties.caption === "string"
                          ? block.properties.caption
                          : ""
                      }
                      className="w-full border-0 bg-transparent px-1 text-center text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/50"
                      onContextMenuCapture={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        dispatchBatch(
                          [
                            {
                              type: "update_block",
                              opId: opId(),
                              blockId: block.id,
                              properties: {
                                caption: event.currentTarget.value,
                              },
                            },
                          ],
                          { coalesceKey: `caption-${block.id}` }
                        )
                      }
                      onBlur={() =>
                        dispatchBatch([], { breakCoalescing: true })
                      }
                    />
                  ) : typeof block.properties.caption === "string" &&
                    block.properties.caption.length > 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                      {block.properties.caption}
                    </p>
                  ) : null}
                </div>
              ) : block.type === "mermaid" ? (
                <div onContextMenuCapture={(event) => event.stopPropagation()}>
                  <MermaidBlockEditor
                    ref={(editor) => setMermaidEditorRef(block.id, editor)}
                    blockId={block.id}
                    value={text}
                    readOnly={readOnly}
                    onChange={(nextText) =>
                      dispatchBatch(
                        [
                          {
                            type: "update_block",
                            opId: opId(),
                            blockId: block.id,
                            properties: { text: nextText },
                          },
                        ],
                        { coalesceKey: `text:${block.id}` }
                      )
                    }
                    onFocus={() => {
                      setFocusedBlockId(block.id)
                      onSelectedBlockChange(block.id)
                      clearSelection()
                    }}
                    onBlur={() => {
                      setFocusedBlockId((current) =>
                        current === block.id ? null : current
                      )
                      dispatchBatch([], { breakCoalescing: true })
                    }}
                    onExit={() => exitCodeBlock(block)}
                    onMergeBackward={() => mergeBackward(block)}
                    onMoveFocus={(direction) => moveFocus(block.id, direction)}
                    onUndo={undo}
                    onRedo={redo}
                  />
                </div>
              ) : block.type === "code" ? (
                <div onContextMenuCapture={(event) => event.stopPropagation()}>
                  <CodeBlockEditor
                    ref={(editor) => setCodeEditorRef(block.id, editor)}
                    blockId={block.id}
                    value={text}
                    language={
                      typeof block.properties.language === "string"
                        ? block.properties.language
                        : undefined
                    }
                    readOnly={readOnly}
                    onChange={(nextText) =>
                      dispatchBatch(
                        [
                          {
                            type: "update_block",
                            opId: opId(),
                            blockId: block.id,
                            properties: { text: nextText },
                          },
                        ],
                        { coalesceKey: `text:${block.id}` }
                      )
                    }
                    onLanguageChange={(language) =>
                      dispatchBatch(
                        [
                          {
                            type: "update_block",
                            opId: opId(),
                            blockId: block.id,
                            properties: { language },
                          },
                        ],
                        { breakCoalescing: true }
                      )
                    }
                    onFocus={() => {
                      setFocusedBlockId(block.id)
                      onSelectedBlockChange(block.id)
                      clearSelection()
                    }}
                    onBlur={() => {
                      setFocusedBlockId((current) =>
                        current === block.id ? null : current
                      )
                      dispatchBatch([], { breakCoalescing: true })
                    }}
                    onExit={() => exitCodeBlock(block)}
                    onMergeBackward={() => mergeBackward(block)}
                    onMoveFocus={(direction) => moveFocus(block.id, direction)}
                    onUndo={undo}
                    onRedo={redo}
                  />
                </div>
              ) : (
                <div
                  className={
                    block.type === "callout"
                      ? "relative flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-secondary-foreground"
                      : "relative flex items-start gap-2"
                  }
                >
                  {block.type === "bulleted_list_item" ? (
                    <span className="flex h-7 w-4 items-center justify-center text-lg leading-none text-muted-foreground">
                      •
                    </span>
                  ) : null}
                  {block.type === "numbered_list_item" ? (
                    <span className="flex h-7 w-6 items-center justify-end text-muted-foreground">
                      {numberedValue(tree, block)}.
                    </span>
                  ) : null}
                  {block.type === "to_do" ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      className="mt-1.5 h-4 w-4 accent-primary"
                      onChange={(event) =>
                        dispatchBatch(
                          [
                            {
                              type: "update_block",
                              opId: opId(),
                              blockId: block.id,
                              properties: {
                                checked: event.currentTarget.checked,
                              },
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
                      aria-label={t("Toggle children")}
                      className={`flex h-7 w-5 items-center justify-center rounded text-muted-foreground transition-transform hover:bg-muted ${
                        isCollapsed ? "" : "rotate-90"
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onToggleCollapsed(block.id)}
                    >
                      ▸
                    </button>
                  ) : null}
                  {block.type === "callout" ? (
                    <span
                      aria-hidden="true"
                      data-callout-icon
                      className="flex shrink-0 items-center justify-center text-base leading-none"
                    >
                      💡
                    </span>
                  ) : null}
                  <div className="relative min-w-0 flex-1">
                    {showPlaceholder ? (
                      <span className="pointer-events-none absolute top-0 left-0 text-muted-foreground/60">
                        {t("Write something, or press '/' for commands")}
                      </span>
                    ) : null}
                    {readOnly ? (
                      <div
                        data-cy="inline-markdown-readonly"
                        data-block-text-editor="true"
                        className={`min-h-7 break-words ${blockClasses(block.type)} ${
                          checked ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        <InlineMarkdown segments={inlineSegments} />
                      </div>
                    ) : (
                      <>
                        {showInlinePreview ? (
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none min-h-7 break-words ${inlinePreviewClasses(
                              block.type
                            )} ${
                              checked
                                ? "text-muted-foreground line-through"
                                : ""
                            }`}
                          >
                            <InlineMarkdown
                              segments={inlineSegments}
                              dataCy="inline-markdown-preview"
                            />
                          </div>
                        ) : null}
                        <div
                          ref={(element) => setRef(block.id, element)}
                          contentEditable
                          onPointerDownCapture={(event) => {
                            if (event.button === 0) {
                              if (preserveMenuSelectionRef.current) {
                                preserveMenuSelectionRef.current = false
                                clearSelection()
                              }
                              return
                            }
                            if (event.button !== 2) return
                            prepareTextBlockMenu(block.id, event.currentTarget)
                          }}
                          onMouseDownCapture={(event) => {
                            if (event.button === 2) {
                              prepareTextBlockMenu(
                                block.id,
                                event.currentTarget
                              )
                            }
                          }}
                          onContextMenuCapture={(event) => {
                            const useNativeMenu =
                              nativeTextContextBlockRef.current === block.id ||
                              hasNativeTextSelection(
                                containerRef.current,
                                event.currentTarget
                              )
                            nativeTextContextBlockRef.current = null
                            if (useNativeMenu) {
                              pendingContextMenuBlockRef.current = null
                              event.stopPropagation()
                            }
                          }}
                          suppressContentEditableWarning
                          data-block-text-editor="true"
                          spellCheck
                          className={`min-h-7 break-words outline-none ${
                            text.length > 0
                              ? "inline-block max-w-full"
                              : "w-full"
                          } ${blockClasses(block.type)} ${
                            checked ? "text-muted-foreground line-through" : ""
                          } ${
                            showInlinePreview
                              ? "absolute inset-0 z-10 text-transparent caret-transparent"
                              : ""
                          }`}
                          onFocus={() => {
                            if (restoringMenuFocusRef.current) return
                            setFocusedBlockId(block.id)
                            onSelectedBlockChange(block.id)
                            if (!preserveMenuSelectionRef.current)
                              clearSelection()
                          }}
                          onBlur={() => {
                            setFocusedBlockId((current) =>
                              current === block.id ? null : current
                            )
                            setSlash((current) =>
                              current?.blockId === block.id ? null : current
                            )
                            dispatchBatch([], { breakCoalescing: true })
                          }}
                          onInput={(event: FormEvent<HTMLElement>) => {
                            preserveMenuSelectionRef.current = false
                            clearSelection()
                            handleInput(block, event.currentTarget)
                          }}
                          onPaste={(event) =>
                            handleTextPaste(block, event.currentTarget, event)
                          }
                          onKeyDown={(event) => handleKeyDown(block, event)}
                        />
                      </>
                    )}
                    {blockSlash ? (
                      <SlashMenu
                        items={slashItems}
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
          </ContextMenuTrigger>
          <BlockContextOptionsContent
            count={Math.max(1, menuTargetCount)}
            canWrite={!readOnly}
            canContinue={!readOnly && menuTargetCount === 1}
            canPaste={clipboardReady}
            onCloseAutoFocus={restoreBlockMenuFocus}
            onAction={(action) => runOptionsAction(action, block.id)}
            onTurnInto={turnSelectedInto}
          />
        </ContextMenu>
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
    <div
      ref={containerRef}
      data-cy="block-editor"
      className="relative space-y-0.5"
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={finishMarquee}
      onPointerCancel={finishMarquee}
      onPaste={(event) => {
        if (readOnly || !onUploadImage) return
        const file = [...(event.clipboardData?.files ?? [])].find((item) =>
          item.type.startsWith("image/")
        )
        if (!file) return
        event.preventDefault()
        const target =
          selectedBlockId ??
          focusedBlockId ??
          getBlock(tree, tree.rootId).content.at(-1) ??
          null
        if (target) void insertImageAfter(target, file)
      }}
      onDragOver={(event) => {
        // Reordenação de bloco é tratada por linha; aqui só aceita arquivo de imagem.
        if (draggingIdsRef.current.length > 0) return
        if (
          !readOnly &&
          onUploadImage &&
          [...event.dataTransfer.types].includes("Files")
        ) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        if (draggingIdsRef.current.length > 0 || readOnly || !onUploadImage)
          return
        const file = [...event.dataTransfer.files].find((item) =>
          item.type.startsWith("image/")
        )
        if (!file) return
        event.preventDefault()
        const target =
          selectedBlockId ??
          focusedBlockId ??
          getBlock(tree, tree.rootId).content.at(-1) ??
          null
        if (target) void insertImageAfter(target, file)
      }}
    >
      {marqueeRect ? (
        <div
          aria-hidden="true"
          data-cy="block-selection-marquee"
          className="pointer-events-none fixed z-50 border border-primary/70 bg-primary/15"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.right - marqueeRect.left,
            height: marqueeRect.bottom - marqueeRect.top,
          }}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {selection.size > 0
          ? t(
              selectedRootIds.length === 1
                ? "{count} block selected"
                : "{count} blocks selected",
              { count: selectedRootIds.length }
            )
          : ""}
      </p>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        data-cy="image-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const target = imageTargetBlockRef.current
          event.target.value = ""
          imageTargetBlockRef.current = null
          if (file && target) void insertImageAfter(target, file)
        }}
      />
      {uploadingImage ? (
        <p
          className="px-8 py-2 text-xs text-muted-foreground"
          data-cy="image-uploading"
        >
          {t("Uploading image…")}
        </p>
      ) : null}
      {getBlock(tree, tree.rootId).content.map((childId) =>
        renderBlock(getBlock(tree, childId), 0)
      )}
    </div>
  )
}
