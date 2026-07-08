import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { BlockEditor } from "@/components/editor/BlockEditor"
import {
  applyOperation,
  createPageTree,
  newBlock,
  type BlockTree,
} from "@/lib/engine/tree"

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

    const handle = screen.getByRole("button", { name: "Arrastar bloco" })

    expect(handle).toHaveClass("top-1/2", "-left-7", "-translate-y-1/2")
    expect(container.querySelectorAll("[data-drag-handle-dot]")).toHaveLength(6)
    expect(handle).not.toHaveTextContent("⋮⋮")
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

    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0)
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

describe("BlockEditor toggle collapse", () => {
  // Regressão: o efeito que escreve o texto no contenteditable dependia só de
  // `tree`; expandir um toggle remontava os filhos sem tocar `tree` e eles
  // voltavam em branco. O efeito agora também depende de `collapsed`.
  it("keeps child text after collapse then expand", () => {
    const tree = treeWithToggle()
    const { rerender } = render(<BlockEditor {...editorProps(tree, new Set())} />)

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

describe("BlockEditor block context menu", () => {
  it("right-clicking the drag handle opens copy/cut/delete for that block", async () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor {...editorProps(createTree(), new Set())} dispatchBatch={dispatchBatch} />
    )

    const handle = container.querySelector(
      '[data-cy="block-handle-numbered-item"]'
    )!
    fireEvent.contextMenu(handle)

    await waitFor(() =>
      expect(
        document.querySelector('[data-cy="block-context-menu"]')
      ).toBeInTheDocument()
    )
    expect(document.querySelector('[data-cy="block-menu-copy"]')).toBeInTheDocument()
    expect(document.querySelector('[data-cy="block-menu-cut"]')).toBeInTheDocument()

    fireEvent.click(document.querySelector('[data-cy="block-menu-delete"]')!)

    expect(dispatchBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ type: "delete_block", blockId: "numbered-item" })],
      { breakCoalescing: true }
    )
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
