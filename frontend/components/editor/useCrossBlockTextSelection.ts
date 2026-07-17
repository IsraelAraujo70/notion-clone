import { useEffect, useEffectEvent, type RefObject } from "react"

interface CaretPoint {
  node: Node
  offset: number
  editable: HTMLElement
}

interface TextSelectionGesture {
  pointerId: number
  startX: number
  startY: number
  anchor: CaretPoint
  active: boolean
}

type LegacyCaretDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

const TEXT_BLOCK_SELECTOR = '[data-block-text-editor="true"]'
const EDITABLE_TEXT_BLOCK_SELECTOR =
  '[contenteditable="true"][data-block-text-editor="true"]'

function textBlockForNode(container: HTMLElement, node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  const editable = element?.closest<HTMLElement>(TEXT_BLOCK_SELECTOR) ?? null
  return editable && container.contains(editable) ? editable : null
}

function editableBoundaryPoint(editable: HTMLElement, atEnd: boolean) {
  const range = editable.ownerDocument.createRange()
  range.selectNodeContents(editable)
  range.collapse(!atEnd)
  return { node: range.startContainer, offset: range.startOffset, editable }
}

function caretPointFromCoordinates(
  container: HTMLElement,
  x: number,
  y: number
): CaretPoint | null {
  const document = container.ownerDocument
  const position = document.caretPositionFromPoint?.(x, y)
  if (position) {
    const editable = textBlockForNode(container, position.offsetNode)
    if (editable) {
      return {
        node: position.offsetNode,
        offset: position.offset,
        editable,
      }
    }
  }

  const range = (document as LegacyCaretDocument).caretRangeFromPoint?.(x, y)
  if (range) {
    const editable = textBlockForNode(container, range.startContainer)
    if (editable) {
      return { node: range.startContainer, offset: range.startOffset, editable }
    }
  }

  const hit = document.elementFromPoint?.(x, y)
  const row = hit?.closest<HTMLElement>("[data-block-id]")
  if (!row || !container.contains(row)) return null
  const editable = row.querySelector<HTMLElement>(TEXT_BLOCK_SELECTOR)
  if (!editable) return null
  const rect = editable.getBoundingClientRect()
  return editableBoundaryPoint(editable, x >= rect.left + rect.width / 2)
}

function setSelection(anchor: CaretPoint, focus: CaretPoint) {
  const document = anchor.editable.ownerDocument
  const selection = document.defaultView?.getSelection()
  if (!selection) return
  if (selection.setBaseAndExtent) {
    selection.setBaseAndExtent(
      anchor.node,
      anchor.offset,
      focus.node,
      focus.offset
    )
    return
  }
  const anchorComesFirst =
    anchor.node === focus.node
      ? anchor.offset <= focus.offset
      : Boolean(
          anchor.node.compareDocumentPosition(focus.node) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
  const start = anchorComesFirst ? anchor : focus
  const end = anchorComesFirst ? focus : anchor
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

function crossesUnsupportedBlock(
  container: HTMLElement,
  anchor: HTMLElement,
  focus: HTMLElement
) {
  const rows = [...container.querySelectorAll<HTMLElement>("[data-block-id]")]
  const anchorRow = anchor.closest<HTMLElement>("[data-block-id]")
  const focusRow = focus.closest<HTMLElement>("[data-block-id]")
  const anchorIndex = anchorRow ? rows.indexOf(anchorRow) : -1
  const focusIndex = focusRow ? rows.indexOf(focusRow) : -1
  if (anchorIndex === -1 || focusIndex === -1) return true
  return rows
    .slice(
      Math.min(anchorIndex, focusIndex),
      Math.max(anchorIndex, focusIndex) + 1
    )
    .some((row) => {
      const editable = row.querySelector<HTMLElement>(TEXT_BLOCK_SELECTOR)
      return editable?.closest("[data-block-id]") !== row
    })
}

export function useCrossBlockTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  readOnly: boolean
) {
  const isReadOnly = useEffectEvent(() => readOnly)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ownerDocument = container.ownerDocument
    const ownerWindow = ownerDocument.defaultView

    let gesture: TextSelectionGesture | null = null
    let suspendedEditables: Array<[HTMLElement, string | null]> = []
    let selectionFrame: number | null = null

    const restoreEditing = () => {
      if (selectionFrame !== null) {
        ownerWindow?.cancelAnimationFrame(selectionFrame)
        selectionFrame = null
      }
      for (const [element, contentEditable] of suspendedEditables) {
        if (!element.isConnected) continue
        if (isReadOnly()) element.setAttribute("contenteditable", "false")
        else if (contentEditable === null)
          element.removeAttribute("contenteditable")
        else element.setAttribute("contenteditable", contentEditable)
      }
      suspendedEditables = []
    }

    const suspendEditing = () => {
      if (suspendedEditables.length > 0) return
      suspendedEditables = [
        ...container.querySelectorAll<HTMLElement>(
          EDITABLE_TEXT_BLOCK_SELECTOR
        ),
      ].map((element) => [element, element.getAttribute("contenteditable")])
      for (const [element] of suspendedEditables) {
        element.setAttribute("contenteditable", "false")
      }
      const activeElement = ownerDocument.activeElement
      if (
        activeElement instanceof HTMLElement &&
        container.contains(activeElement)
      ) {
        activeElement.blur()
      }
    }

    const finish = () => {
      gesture = null
    }

    const finishPointer = (event: PointerEvent) => {
      if (gesture?.pointerId !== event.pointerId) return
      finish()
      if (event.type === "pointercancel") restoreEditing()
    }

    const onPointerDown = (event: PointerEvent) => {
      restoreEditing()
      if (event.button !== 0 || event.pointerType === "touch" || event.shiftKey)
        return
      const target = event.target
      if (!(target instanceof Element)) return
      const editable = target.closest<HTMLElement>(EDITABLE_TEXT_BLOCK_SELECTOR)
      if (!editable || !container.contains(editable)) return
      const anchor = caretPointFromCoordinates(
        container,
        event.clientX,
        event.clientY
      )
      if (!anchor || anchor.editable !== editable) return
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        anchor,
        active: false,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return
      if ((event.buttons & 1) === 0 || !gesture.anchor.node.isConnected) {
        finish()
        return
      }
      if (
        !gesture.active &&
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY
        ) < 5
      ) {
        return
      }

      const focus = caretPointFromCoordinates(
        container,
        event.clientX,
        event.clientY
      )
      if (!focus) {
        if (gesture.active) event.preventDefault()
        return
      }
      if (!gesture.active && focus.editable === gesture.anchor.editable) return
      if (
        crossesUnsupportedBlock(
          container,
          gesture.anchor.editable,
          focus.editable
        )
      ) {
        if (gesture.active) event.preventDefault()
        return
      }

      if (!gesture.active) suspendEditing()
      gesture.active = true
      event.preventDefault()
      const anchor = gesture.anchor
      setSelection(anchor, focus)
      if (selectionFrame !== null) {
        ownerWindow?.cancelAnimationFrame(selectionFrame)
      }
      selectionFrame =
        ownerWindow?.requestAnimationFrame(() => {
          selectionFrame = null
          if (anchor.node.isConnected && focus.node.isConnected) {
            setSelection(anchor, focus)
          }
        }) ?? null
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (
        event.button === 0 &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        restoreEditing()
      }
    }

    const onSelectionChange = () => {
      if (gesture || selectionFrame !== null) return
      const selection = ownerWindow?.getSelection()
      if (!selection || selection.isCollapsed) restoreEditing()
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (suspendedEditables.length === 0) return
      if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c")
        return
      restoreEditing()
    }

    container.addEventListener("pointerdown", onPointerDown)
    ownerDocument.addEventListener("pointerdown", onDocumentPointerDown)
    ownerDocument.addEventListener("pointermove", onPointerMove)
    ownerDocument.addEventListener("pointerup", finishPointer)
    ownerDocument.addEventListener("pointercancel", finishPointer)
    ownerDocument.addEventListener("selectionchange", onSelectionChange)
    ownerDocument.addEventListener("keydown", onKeyDown)
    ownerWindow?.addEventListener("blur", restoreEditing)
    return () => {
      restoreEditing()
      container.removeEventListener("pointerdown", onPointerDown)
      ownerDocument.removeEventListener("pointerdown", onDocumentPointerDown)
      ownerDocument.removeEventListener("pointermove", onPointerMove)
      ownerDocument.removeEventListener("pointerup", finishPointer)
      ownerDocument.removeEventListener("pointercancel", finishPointer)
      ownerDocument.removeEventListener("selectionchange", onSelectionChange)
      ownerDocument.removeEventListener("keydown", onKeyDown)
      ownerWindow?.removeEventListener("blur", restoreEditing)
    }
  }, [containerRef])
}
