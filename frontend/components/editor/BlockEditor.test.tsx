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
      name: "Arrastar ou abrir opções do bloco",
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

    expect(await screen.findByText("1 bloco selecionado")).toBeVisible()
    expect(screen.getByText("Duplicar")).toBeVisible()
    expect(screen.getByText("Transformar em")).toBeVisible()
  })

  it("preserves a multi-selection when right-clicking one selected block", async () => {
    const { container } = render(
      <BlockEditor {...editorProps(treeWithThreeBlocks(), new Set())} />
    )
    for (const id of ["select-a", "select-b"]) {
      fireEvent.pointerDown(
        container.querySelector(`[data-block-id="${id}"]`)!,
        { pointerId: 1, pointerType: "mouse", button: 0, metaKey: true }
      )
    }

    const selected = container.querySelector('[data-block-id="select-a"]')!
    fireEvent.pointerDown(selected, {
      pointerId: 9,
      pointerType: "mouse",
      button: 2,
      ctrlKey: true,
    })
    fireEvent.contextMenu(selected)

    expect(
      (await screen.findAllByText("2 blocos selecionados")).some(
        (element) => !element.classList.contains("sr-only")
      )
    ).toBe(true)
  })

  it("leaves native copy untouched while text is selected", () => {
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

    expect(fireEvent.contextMenu(editable)).toBe(true)
    expect(document.querySelector('[data-cy="block-context-menu"]')).toBeNull()

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
  it("right-clicking the drag handle opens copy/cut/delete for that block", async () => {
    const dispatchBatch = vi.fn()
    const { container } = render(
      <BlockEditor
        {...editorProps(createTree(), new Set())}
        dispatchBatch={dispatchBatch}
      />
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
    expect(
      document.querySelector('[data-cy="block-menu-copy"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-cy="block-menu-cut"]')
    ).toBeInTheDocument()

    fireEvent.click(document.querySelector('[data-cy="block-menu-delete"]')!)

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
    await user.click(
      screen.getByRole("combobox", { name: "Linguagem do código" })
    )
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
