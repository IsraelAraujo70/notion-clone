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

    expect(handle).toHaveClass("top-1/2", "left-0.5", "-translate-y-1/2", "h-8", "w-7")
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

    expect(document.querySelectorAll('[data-cy="code-editor-code-1"] .cm-line')).toHaveLength(2)
    await user.click(screen.getByRole("combobox", { name: "Linguagem do código" }))
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
