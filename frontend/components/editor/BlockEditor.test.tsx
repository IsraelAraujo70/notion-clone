import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { BlockEditor } from "@/components/editor/BlockEditor"
import type { Operation } from "@reason/core/contracts"
import {
  applyOperation,
  createPageTree,
  newBlock,
  type BlockTree,
} from "@reason/core/engine/tree"
import { BLOCK_CLIPBOARD_MIME } from "@/lib/editor/block-clipboard"

function createTree(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const item = newBlock(
    "numbered_list_item",
    { text: "Calça" },
    "numbered-item"
  )

  return applyOperation(page, {
    type: "insert_block",
    opId: "insert-numbered-item",
    block: item,
    parentId: page.rootId,
    index: 0,
  }).tree
}

function treeWithTwoParagraphs(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const first = newBlock("paragraph", { text: "primeiro" }, "block-a")
  const second = newBlock("paragraph", { text: "segundo" }, "block-b")
  return applyOperation(
    applyOperation(page, {
      type: "insert_block",
      opId: "insert-a",
      block: first,
      parentId: page.rootId,
      index: 0,
    }).tree,
    {
      type: "insert_block",
      opId: "insert-b",
      block: second,
      parentId: page.rootId,
      index: 1,
    }
  ).tree
}

function treeWithEmptyParagraph(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const tree = applyOperation(page, {
    type: "insert_block",
    opId: "insert-empty",
    block: newBlock("paragraph", { text: "" }, "empty-block"),
    parentId: page.rootId,
    index: 0,
  }).tree
  const root = tree.blocks.get(tree.rootId)!
  return {
    ...tree,
    blocks: new Map(tree.blocks).set(root.id, {
      ...root,
      parentId: "workspace-container-not-in-page-snapshot",
    }),
  }
}

function setEditableText(editable: HTMLElement, text: string) {
  editable.textContent = text
  const range = document.createRange()
  range.selectNodeContents(editable)
  range.collapse(false)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  fireEvent.input(editable)
}

describe("BlockEditor slash menu", () => {
  it("preserves visible focus and selection in an incomplete page snapshot", async () => {
    const onSelectedBlockChange = vi.fn()
    const onSelectedBlockIdsChange = vi.fn()
    const onFocusedBlockChange = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithEmptyParagraph(), new Set())}
        selectedBlockId="empty-block"
        onSelectedBlockChange={onSelectedBlockChange}
        onSelectedBlockIdsChange={onSelectedBlockIdsChange}
        onFocusedBlockChange={onFocusedBlockChange}
      />
    )
    const row = container.querySelector('[data-block-id="empty-block"]')!
    const editable = row.querySelector<HTMLElement>("[contenteditable]")!

    editable.focus()
    fireEvent.pointerDown(row, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      metaKey: true,
    })

    await waitFor(() => {
      expect(onFocusedBlockChange).toHaveBeenLastCalledWith("empty-block")
      expect(onSelectedBlockIdsChange).toHaveBeenLastCalledWith(["empty-block"])
    })
    expect(onSelectedBlockChange).not.toHaveBeenCalledWith(null)
  })

  it("clears focus and selections when a block is trashed", async () => {
    const onSelectedBlockChange = vi.fn()
    const onSelectedBlockIdsChange = vi.fn()
    const onFocusedBlockChange = vi.fn()
    const tree = treeWithEmptyParagraph()
    const props = {
      ...editorProps(tree, new Set<string>()),
      selectedBlockId: "empty-block",
      onSelectedBlockChange,
      onSelectedBlockIdsChange,
      onFocusedBlockChange,
    }
    const { container, rerender } = render(<BlockEditor {...props} />)
    const row = container.querySelector('[data-block-id="empty-block"]')!
    row.querySelector<HTMLElement>("[contenteditable]")!.focus()
    fireEvent.pointerDown(row, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      metaKey: true,
    })
    await waitFor(() =>
      expect(onSelectedBlockIdsChange).toHaveBeenLastCalledWith(["empty-block"])
    )

    const trashedTree = applyOperation(tree, {
      type: "delete_block",
      opId: "trash-empty",
      blockId: "empty-block",
    }).tree
    rerender(<BlockEditor {...props} tree={trashedTree} />)

    await waitFor(() => {
      expect(onFocusedBlockChange).toHaveBeenLastCalledWith(null)
      expect(onSelectedBlockChange).toHaveBeenLastCalledWith(null)
      expect(onSelectedBlockIdsChange).toHaveBeenLastCalledWith([])
    })
  })

  it("opens all options for slash and keeps the query when Escape closes it", () => {
    const { container } = render(
      <BlockEditor {...editorProps(treeWithEmptyParagraph(), new Set())} />
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="empty-block"] [contenteditable]'
    )!

    editable.focus()
    setEditableText(editable, "/")

    expect(screen.getByRole("button", { name: /Text$/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /Image$/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /Mermaid$/ })).toBeVisible()

    fireEvent.keyDown(editable, { key: "Escape" })
    expect(screen.queryByRole("button", { name: /Text$/ })).toBeNull()
    expect(editable).toHaveTextContent("/")
  })

  it("filters title aliases and applies the active heading with the keyboard", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithEmptyParagraph(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="empty-block"] [contenteditable]'
    )!

    editable.focus()
    setEditableText(editable, "/title")

    expect(screen.getByRole("button", { name: /Heading 1$/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /Heading 3$/ })).toBeVisible()
    fireEvent.keyDown(editable, { key: "ArrowDown" })
    fireEvent.keyDown(editable, { key: "Enter" })

    expect(dispatchBatch).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          type: "update_block",
          blockId: "empty-block",
          blockType: "heading2",
          properties: expect.objectContaining({ text: "" }),
        }),
      ],
      { breakCoalescing: true }
    )
  })

  it("shows useful options for block and applies a mouse selection", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithEmptyParagraph(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="empty-block"] [contenteditable]'
    )!

    editable.focus()
    setEditableText(editable, "/block")

    expect(screen.getByRole("button", { name: /Text$/ })).toBeVisible()
    expect(screen.getByRole("button", { name: /Image$/ })).toBeVisible()
    fireEvent.mouseDown(screen.getByRole("button", { name: /Quote$/ }))

    expect(dispatchBatch).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          type: "update_block",
          blockId: "empty-block",
          blockType: "quote",
          properties: expect.objectContaining({ text: "" }),
        }),
      ],
      { breakCoalescing: true }
    )
    expect(editable).toHaveFocus()
  })

  it("creates Mermaid through the canonical update operation", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithEmptyParagraph(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="empty-block"] [contenteditable]'
    )!

    editable.focus()
    setEditableText(editable, "/mermaid")
    fireEvent.mouseDown(screen.getByRole("button", { name: /Mermaid$/ }))

    expect(dispatchBatch).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          type: "update_block",
          blockId: "empty-block",
          blockType: "mermaid",
          properties: expect.objectContaining({ text: "" }),
        }),
      ],
      { breakCoalescing: true }
    )
  })

  it("closes the menu when focus leaves the block", () => {
    const { container } = render(
      <div>
        <button type="button">Outside</button>
        <BlockEditor {...editorProps(treeWithEmptyParagraph(), new Set())} />
      </div>
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="empty-block"] [contenteditable]'
    )!

    editable.focus()
    setEditableText(editable, "/title")
    expect(screen.getByRole("button", { name: /Heading 1$/ })).toBeVisible()

    const outside = screen.getByRole("button", { name: "Outside" })
    fireEvent.blur(editable, { relatedTarget: outside })
    fireEvent.focus(outside)

    expect(screen.queryByRole("button", { name: /Heading 1$/ })).toBeNull()
  })
})

describe("BlockEditor drag handle", () => {
  it("renders a centered six-dot handle in the block gutter", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        tree={createTree()}
        collapsed={new Set()}
        onToggleCollapsed={vi.fn()}
        selectedBlockId="numbered-item"
        onSelectedBlockChange={vi.fn()}
        dispatchBatch={dispatchBatch}
        undo={vi.fn()}
        redo={vi.fn()}
      />
    )

    const handle = screen.getByRole("button", {
      name: "Drag or open block options",
    })

    expect(handle).toHaveClass(
      "top-1/2",
      "left-0.5",
      "-translate-y-1/2",
      "h-8",
      "w-7"
    )
    expect(container.querySelectorAll("[data-drag-handle-dot]")).toHaveLength(6)
    expect(handle).not.toHaveTextContent("⋮⋮")
  })

  it("drops a block below another via the drag handle", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithTwoParagraphs(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )

    const handle = container.querySelector(
      '[data-cy="block-handle-block-a"]'
    ) as HTMLElement
    const target = container.querySelector(
      '[data-block-id="block-b"]'
    ) as HTMLElement

    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(() => "block-a"),
      types: ["text/plain", "application/x-notion-block"],
      files: [] as unknown as FileList,
    }

    fireEvent.dragStart(handle, { dataTransfer })
    // Alvo na metade de baixo → posição "below" (vira índice 2, ajustado para 1 = no-op se já for o fim; aqui A sobe depois de B)
    const rect = {
      top: 100,
      bottom: 140,
      height: 40,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect as DOMRect)

    fireEvent.dragOver(target, {
      dataTransfer,
      clientY: 130,
    })
    fireEvent.drop(target, {
      dataTransfer,
      clientY: 130,
    })
    fireEvent.dragEnd(handle, { dataTransfer })

    expect(dispatchBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: "move_block",
          blockId: "block-a",
          newParentId: "page-root",
          index: 1,
        }),
      ],
      { breakCoalescing: true }
    )
  })
})

function treeWithChildPage(): BlockTree {
  const page = createPageTree("Pai", "page-root")
  const child = newBlock("page", { title: "Filha", icon: "🚀" }, "child-page")
  const body = newBlock("paragraph", { text: "corpo" }, "body")

  return applyOperation(
    applyOperation(page, {
      type: "insert_block",
      opId: "insert-child-page",
      block: child,
      parentId: page.rootId,
      index: 0,
    }).tree,
    {
      type: "insert_block",
      opId: "insert-body",
      block: body,
      parentId: page.rootId,
      index: 1,
    }
  ).tree
}

describe("BlockEditor page blocks", () => {
  it("renders a child page as a navigable link row, not a text block", async () => {
    const onOpenPage = vi.fn()
    render(
      <BlockEditor
        tree={treeWithChildPage()}
        collapsed={new Set()}
        onToggleCollapsed={vi.fn()}
        selectedBlockId={null}
        onSelectedBlockChange={vi.fn()}
        dispatchBatch={vi.fn()}
        undo={vi.fn()}
        redo={vi.fn()}
        onOpenPage={onOpenPage}
      />
    )

    const link = screen.getByRole("button", { name: "Filha" })
    expect(link).toHaveTextContent("🚀")
    await userEvent.click(link)
    expect(onOpenPage).toHaveBeenCalledWith("child-page")

    // O bloco `page` não é editável: seu conteúdo vive na própria página.
    const row = document.querySelector('[data-block-id="child-page"]')
    expect(row?.querySelector('[contenteditable="true"]')).toBeNull()
  })

  it("read-only mode drops every contenteditable surface", () => {
    render(
      <BlockEditor
        tree={treeWithChildPage()}
        collapsed={new Set()}
        onToggleCollapsed={vi.fn()}
        selectedBlockId={null}
        onSelectedBlockChange={vi.fn()}
        dispatchBatch={vi.fn()}
        undo={vi.fn()}
        redo={vi.fn()}
        readOnly
      />
    )

    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(
      0
    )
    expect(screen.getByText("corpo")).toBeInTheDocument()
  })
})

function treeWithToggle(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const toggle = newBlock("toggle", { text: "Toggle" }, "toggle-1")
  const child = newBlock("paragraph", { text: "filho um" }, "child-1")
  const withToggle = applyOperation(page, {
    type: "insert_block",
    opId: "insert-toggle",
    block: toggle,
    parentId: page.rootId,
    index: 0,
  }).tree
  return applyOperation(withToggle, {
    type: "insert_block",
    opId: "insert-child",
    block: child,
    parentId: toggle.id,
    index: 0,
  }).tree
}

function editorProps(tree: BlockTree, collapsed: Set<string>) {
  return {
    tree,
    collapsed,
    onToggleCollapsed: vi.fn(),
    selectedBlockId: null,
    onSelectedBlockChange: vi.fn(),
    dispatchBatch: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  }
}

function MarkdownEditor() {
  const page = createPageTree("Markdown", "markdown-root")
  const initialTree = applyOperation(page, {
    type: "insert_block",
    opId: "insert-markdown-target",
    block: newBlock("paragraph", { text: "" }, "markdown-target"),
    parentId: page.rootId,
    index: 0,
  }).tree
  const [tree, setTree] = useState(initialTree)

  const dispatchBatch = (operations: Operation[]) => {
    setTree((current) =>
      operations.reduce(
        (next, operation) => applyOperation(next, operation).tree,
        current
      )
    )
  }

  return (
    <BlockEditor
      {...editorProps(tree, new Set())}
      dispatchBatch={dispatchBatch}
    />
  )
}

describe("BlockEditor Markdown shortcuts", () => {
  it("converts ### into heading 3 and keeps typing at the caret", async () => {
    const user = userEvent.setup()
    const { container } = render(<MarkdownEditor />)
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="markdown-target"] [contenteditable]'
    )!

    await user.click(editable)
    editable.textContent = "###\u00a0after"
    const range = document.createRange()
    range.setStart(editable.firstChild!, 4)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.input(editable)

    expect(
      container.querySelector('[data-block-id="markdown-target"]')
    ).toHaveAttribute("data-block-type", "heading3")
    expect(editable).toHaveTextContent("after")
    expect(window.getSelection()?.anchorNode).toBe(editable.firstChild)
    expect(window.getSelection()?.anchorOffset).toBe(0)

    await user.type(editable, "Heading 3 ", { skipClick: true })
    expect(editable).toHaveTextContent("Heading 3 after")
  })
})

function treeWithThreeBlocks() {
  let tree = createPageTree("Selection", "selection-root")
  for (const [index, id] of ["select-a", "select-b", "select-c"].entries()) {
    tree = applyOperation(tree, {
      type: "insert_block",
      opId: `insert-${id}`,
      block: newBlock("paragraph", { text: id }, id),
      parentId: tree.rootId,
      index,
    }).tree
  }
  return tree
}

function treeWithMissingRootParent() {
  const tree = treeWithThreeBlocks()
  const root = tree.blocks.get(tree.rootId)!
  const blocks = new Map(tree.blocks)
  blocks.set(root.id, { ...root, parentId: "missing-container" })
  return { ...tree, blocks }
}

describe("BlockEditor block selection", () => {
  it("draws a geometric marquee and selects intersecting rows", async () => {
    const onSelectedBlockIdsChange = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithThreeBlocks(), new Set())}
        onSelectedBlockIdsChange={onSelectedBlockIdsChange}
      />
    )
    const editor = container.firstElementChild as HTMLElement
    const setPointerCapture = vi.fn()
    Object.assign(editor, {
      setPointerCapture,
      releasePointerCapture: vi.fn(),
      hasPointerCapture: () => true,
    })
    const rows = ["select-a", "select-b", "select-c"].map((id, index) => {
      const row = container.querySelector<HTMLElement>(
        `[data-block-id="${id}"]`
      )!
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
        x: 100,
        y: 100 + index * 40,
        left: 100,
        right: 500,
        top: 100 + index * 40,
        bottom: 130 + index * 40,
        width: 400,
        height: 30,
        toJSON: () => ({}),
      })
      return row
    })
    const editable = rows[0].querySelector<HTMLElement>(
      '[contenteditable="true"]'
    )!
    expect(editable).toHaveClass("inline-block", "max-w-full")
    expect(editable).not.toHaveClass("w-full")

    fireEvent.pointerDown(editable, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 120,
      clientY: 110,
    })
    fireEvent.pointerMove(editor, {
      pointerId: 1,
      pointerType: "mouse",
      buttons: 1,
      clientX: 300,
      clientY: 150,
    })
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-cy="block-selection-marquee"]')
    ).toBeNull()

    // A linha continua ocupando a largura disponível, mas o whitespace à direita
    // do texto tem a própria linha como alvo, não o contenteditable.
    fireEvent.pointerDown(rows[0], {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 80,
      clientY: 90,
    })
    fireEvent.pointerMove(editor, {
      pointerId: 2,
      pointerType: "mouse",
      buttons: 1,
      clientX: 520,
      clientY: 175,
    })

    await waitFor(() =>
      expect(onSelectedBlockIdsChange).toHaveBeenLastCalledWith([
        "select-a",
        "select-b",
      ])
    )
    expect(setPointerCapture).toHaveBeenCalledWith(2)
    expect(
      container.querySelector('[data-cy="block-selection-marquee"]')
    ).toBeTruthy()
    expect(rows[0]).toHaveClass("bg-primary/15")
    fireEvent.pointerUp(editor, { pointerId: 2, pointerType: "mouse" })
    expect(
      container.querySelector('[data-cy="block-selection-marquee"]')
    ).toBeNull()
  })

  it("copies a block selection with structured clipboard data", () => {
    const { container } = render(
      <BlockEditor {...editorProps(treeWithThreeBlocks(), new Set())} />
    )
    for (const id of ["select-a", "select-b"]) {
      fireEvent.pointerDown(
        container.querySelector(`[data-block-id="${id}"]`)!,
        { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
      )
    }
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)
    window.getSelection()?.removeAllRanges()
    expect(window.getSelection()?.isCollapsed).toBe(true)
    const values = new Map<string, string>()
    fireEvent.copy(window, {
      clipboardData: {
        files: [],
        setData: (type: string, value: string) => values.set(type, value),
        getData: (type: string) => values.get(type) ?? "",
      },
    })

    expect(values.get("text/plain")).toBe("select-a\nselect-b")
    expect(JSON.parse(values.get(BLOCK_CLIPBOARD_MIME)!)).toMatchObject({
      version: 1,
      blocks: [{ type: "paragraph" }, { type: "paragraph" }],
    })
  })

  it("opens custom options from a handle click", async () => {
    const { container } = render(
      <BlockEditor {...editorProps(createTree(), new Set())} />
    )

    fireEvent.click(
      container.querySelector('[data-cy="block-handle-numbered-item"]')!
    )

    expect(
      (await screen.findAllByText("1 block selected")).some(
        (element) => !element.classList.contains("sr-only")
      )
    ).toBe(true)
    expect(screen.getByText("Duplicate")).toBeVisible()
    expect(screen.getByText("Turn into")).toBeVisible()
  })

  it("preserves a multi-selection after cancelling and copying from the context menu", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <BlockEditor {...editorProps(treeWithThreeBlocks(), new Set())} />
    )
    for (const id of ["select-a", "select-b"]) {
      fireEvent.pointerDown(
        container.querySelector(`[data-block-id="${id}"]`)!,
        { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
      )
    }

    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="select-a"] [contenteditable]'
    )!
    fireEvent.pointerDown(editable, { button: 2, pointerType: "mouse" })
    await Promise.resolve()
    editable.focus()
    fireEvent.contextMenu(editable)

    expect(
      (await screen.findAllByText("2 blocks selected")).some(
        (element) => !element.classList.contains("sr-only")
      )
    ).toBe(true)

    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)
    )

    fireEvent.pointerDown(editable, { button: 2, pointerType: "mouse" })
    await Promise.resolve()
    editable.focus()
    fireEvent.contextMenu(editable)
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)
    await user.click(await screen.findByText("Copy"))
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)
  })

  it("restores menu focus without revalidating selection through a missing parent", async () => {
    const user = userEvent.setup()
    const onSelectedBlockChange = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithMissingRootParent(), new Set())}
        onSelectedBlockChange={onSelectedBlockChange}
      />
    )
    await Promise.resolve()
    for (const id of ["select-a", "select-b"]) {
      fireEvent.pointerDown(
        container.querySelector(`[data-block-id="${id}"]`)!,
        { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
      )
    }
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)

    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="select-a"] [contenteditable]'
    )!
    fireEvent.pointerDown(editable, { button: 2, pointerType: "mouse" })
    fireEvent.contextMenu(editable)
    expect(
      (await screen.findAllByText("2 blocks selected")).some(
        (element) => !element.classList.contains("sr-only")
      )
    ).toBe(true)

    await user.keyboard("{Escape}")
    await waitFor(() => expect(document.activeElement).toBe(editable))
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(2)

    const third = container.querySelector<HTMLElement>(
      '[data-block-id="select-c"] [contenteditable]'
    )!
    fireEvent.pointerDown(third, { button: 0, pointerType: "mouse" })
    third.focus()
    expect(onSelectedBlockChange).toHaveBeenLastCalledWith("select-c")
    expect(container.querySelectorAll(".bg-primary\\/15")).toHaveLength(0)
  })

  it("keeps the native menu when pointerdown starts with selected text", () => {
    const { container } = render(
      <BlockEditor {...editorProps(treeWithThreeBlocks(), new Set())} />
    )
    fireEvent.pointerDown(
      container.querySelector('[data-block-id="select-a"]')!,
      { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
    )
    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="select-a"] [contenteditable]'
    )!
    const range = document.createRange()
    range.selectNodeContents(editable)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    const setData = vi.fn()

    fireEvent.pointerDown(editable, { button: 2, pointerType: "mouse" })
    selection.removeAllRanges()
    editable.focus()
    expect(fireEvent.contextMenu(editable)).toBe(true)
    expect(document.querySelector('[data-cy="block-context-menu"]')).toBeNull()

    selection.addRange(range)
    const event = new Event("copy", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { setData, getData: () => "", files: [] },
    })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(setData).not.toHaveBeenCalled()
    selection.removeAllRanges()
  })

  it("does not hijack Shift-click editing or copy events outside the editor", () => {
    const { container } = render(
      <div>
        <button type="button">Outside</button>
        <BlockEditor {...editorProps(treeWithThreeBlocks(), new Set())} />
      </div>
    )
    fireEvent.pointerDown(
      container.querySelector('[data-block-id="select-a"]')!,
      { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
    )
    const editable = container.querySelector(
      '[data-block-id="select-a"] [contenteditable]'
    )!
    expect(
      fireEvent.pointerDown(editable, {
        pointerId: 2,
        pointerType: "mouse",
        button: 0,
        shiftKey: true,
      })
    ).toBe(true)

    const setData = vi.fn()
    const outside = screen.getByRole("button", { name: "Outside" })
    const event = new Event("copy", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { setData, getData: () => "", files: [] },
    })
    outside.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(setData).not.toHaveBeenCalled()
  })

  it("moves all selected roots when dragging one selected handle", () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(treeWithThreeBlocks(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )
    for (const id of ["select-a", "select-c"]) {
      fireEvent.pointerDown(
        container.querySelector(`[data-block-id="${id}"]`)!,
        { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
      )
    }
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
    }
    fireEvent.dragStart(
      container.querySelector('[data-cy="block-handle-select-a"]')!,
      { dataTransfer }
    )
    const target = container.querySelector<HTMLElement>(
      '[data-block-id="select-b"]'
    )!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      left: 0,
      right: 400,
      top: 100,
      bottom: 140,
      width: 400,
      height: 40,
      toJSON: () => ({}),
    })
    fireEvent.dragOver(target, { dataTransfer, clientY: 130 })
    fireEvent.drop(target, { dataTransfer, clientY: 130 })

    expect(JSON.parse(data.get("application/x-notion-block")!)).toEqual([
      "select-a",
      "select-c",
    ])
    expect(dispatchBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "move_block", blockId: "select-a" }),
        expect.objectContaining({ type: "move_block", blockId: "select-c" }),
      ]),
      { breakCoalescing: true }
    )
  })
})

describe("BlockEditor toggle collapse", () => {
  // Regressão: o efeito que escreve o texto no contenteditable dependia só de
  // `tree`; expandir um toggle remontava os filhos sem tocar `tree` e eles
  // voltavam em branco. O efeito agora também depende de `collapsed`.
  it("keeps child text after collapse then expand", () => {
    const tree = treeWithToggle()
    const { rerender } = render(
      <BlockEditor {...editorProps(tree, new Set())} />
    )

    const childText = () =>
      document.querySelector('[data-block-id="child-1"] [contenteditable]')
        ?.textContent

    expect(childText()).toBe("filho um")

    rerender(<BlockEditor {...editorProps(tree, new Set(["toggle-1"]))} />)
    expect(
      document.querySelector('[data-block-id="child-1"] [contenteditable]')
    ).toBeNull()

    rerender(<BlockEditor {...editorProps(tree, new Set())} />)
    expect(childText()).toBe("filho um")
  })
})

describe("BlockEditor Markdown paste", () => {
  it("dispatches one canonical batch for structural Markdown", () => {
    const page = createPageTree("Test", "page-root")
    const paragraph = newBlock("paragraph", { text: "" }, "paste-target")
    const tree = applyOperation(page, {
      type: "insert_block",
      opId: "insert-target",
      block: paragraph,
      parentId: page.rootId,
      index: 0,
    }).tree
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(tree, new Set())}
        dispatchBatch={dispatchBatch}
      />
    )
    const editable = container.querySelector(
      '[data-block-id="paste-target"] [contenteditable]'
    )!

    fireEvent.paste(editable, {
      clipboardData: {
        files: [],
        getData: () => "# Roadmap\n\n- First\n- [x] Done",
      },
    })

    expect(dispatchBatch).toHaveBeenCalledOnce()
    const [operations, options] = dispatchBatch.mock.calls[0]
    expect(options).toEqual({ breakCoalescing: true })
    expect(operations).toHaveLength(3)
    expect(operations[0]).toMatchObject({
      type: "update_block",
      blockId: "paste-target",
      blockType: "heading1",
      properties: { text: "Roadmap" },
    })
    expect(operations[1]).toMatchObject({
      type: "insert_block",
      parentId: "page-root",
      index: 1,
      block: { type: "bulleted_list_item", properties: { text: "First" } },
    })
    expect(operations[2]).toMatchObject({
      type: "insert_block",
      parentId: "page-root",
      index: 2,
      block: { type: "to_do", properties: { text: "Done", checked: true } },
    })
  })
})

describe("BlockEditor block context menu", () => {
  it("deletes the focused block through the Radix context menu", async () => {
    const dispatchBatch = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <BlockEditor
        {...editorProps(createTree(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )

    const editable = container.querySelector<HTMLElement>(
      '[data-block-id="numbered-item"] [contenteditable]'
    )!
    await user.click(editable)
    await user.pointer({ keys: "[MouseRight]", target: editable })

    await waitFor(() =>
      expect(
        document.querySelector('[data-cy="block-context-menu"]')
      ).toBeInTheDocument()
    )
    expect(
      document.querySelector('[data-cy="block-menu-copy"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-cy="block-menu-cut"]')
    ).toBeInTheDocument()

    await user.click(document.querySelector('[data-cy="block-menu-delete"]')!)

    expect(dispatchBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: "delete_block",
          blockId: "numbered-item",
        }),
      ],
      { breakCoalescing: true }
    )
  })

  it("exposes the current block to AI through an explicit callback", async () => {
    const onAiAction = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(createTree(), new Set())}
        onAiAction={onAiAction}
      />
    )
    fireEvent.contextMenu(
      container.querySelector('[data-cy="block-handle-numbered-item"]')!
    )
    fireEvent.click(
      await waitFor(() =>
        document.querySelector('[data-cy="block-menu-ai-continue"]')!
      )
    )
    expect(onAiAction).toHaveBeenCalledWith("continue_writing", [
      "numbered-item",
    ])
  })
})

function treeWithCallout(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const callout = newBlock("callout", { text: "Aviso" }, "callout-1")
  return applyOperation(page, {
    type: "insert_block",
    opId: "insert-callout",
    block: callout,
    parentId: page.rootId,
    index: 0,
  }).tree
}

describe("BlockEditor callout layout", () => {
  // A lâmpada e o conteúdo compartilham o mesmo wrapper com items-center,
  // para o centro vertical do bloco bater com o ícone (não items-start + h-7).
  it("wraps icon and content in a centered callout shell", () => {
    render(<BlockEditor {...editorProps(treeWithCallout(), new Set())} />)

    const row = document.querySelector('[data-block-id="callout-1"]')
    expect(row).toBeTruthy()

    const icon = row!.querySelector("[data-callout-icon]")
    expect(icon).toBeTruthy()
    expect(icon).toHaveTextContent("💡")

    const shell = icon!.parentElement
    expect(shell).toHaveClass("items-center", "bg-secondary", "rounded-md")
    expect(shell?.contains(row!.querySelector("[contenteditable]")!)).toBe(true)
  })
})

function treeWithCode(): BlockTree {
  const page = createPageTree("Test", "page-root")
  const code = newBlock(
    "code",
    { text: "const answer = 42\nreturn answer", language: "typescript" },
    "code-1"
  )
  return applyOperation(page, {
    type: "insert_block",
    opId: "insert-code",
    block: code,
    parentId: page.rootId,
    index: 0,
  }).tree
}

describe("BlockEditor code blocks", () => {
  it("keeps code in the operation path when its language changes", async () => {
    const dispatchBatch = vi.fn()
    const user = userEvent.setup()
    render(
      <BlockEditor
        {...editorProps(treeWithCode(), new Set())}
        dispatchBatch={dispatchBatch}
      />
    )

    expect(
      document.querySelectorAll('[data-cy="code-editor-code-1"] .cm-line')
    ).toHaveLength(2)
    await user.click(screen.getByRole("combobox", { name: "Code language" }))
    await user.click(screen.getByText("Python"))

    expect(dispatchBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: "update_block",
          blockId: "code-1",
          properties: { language: "python" },
        }),
      ],
      { breakCoalescing: true }
    )
  })
})
