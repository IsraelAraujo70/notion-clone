import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CodeBlockEditor } from "@/components/editor/CodeBlockEditor"

function props(overrides: Partial<React.ComponentProps<typeof CodeBlockEditor>> = {}) {
  return {
    blockId: "code-1",
    value: "const answer = 42\nreturn answer",
    language: "typescript",
    readOnly: false,
    onChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onExit: vi.fn(),
    onMergeBackward: vi.fn(),
    onMoveFocus: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

describe("CodeBlockEditor", () => {
  it("renders multiline TypeScript with syntax tokens and changes language", async () => {
    const onLanguageChange = vi.fn()
    const user = userEvent.setup()
    render(<CodeBlockEditor {...props({ onLanguageChange })} />)

    await waitFor(() =>
      expect(document.querySelectorAll('[data-cy="code-editor-code-1"] .cm-line')).toHaveLength(2)
    )
    expect(
      document.querySelector('[data-cy="code-editor-code-1"] .cm-line span')
    ).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Linguagem do código" }))
    await user.click(screen.getByText("Python"))

    expect(onLanguageChange).toHaveBeenCalledWith("python")
  })

  it("applies remote multiline updates without emitting another operation", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<CodeBlockEditor {...props({ onChange })} />)

    rerender(
      <CodeBlockEditor
        {...props({
          onChange,
          value: "line one\nline two\nline three\nline four",
        })}
      />
    )

    await waitFor(() =>
      expect(document.querySelectorAll('[data-cy="code-editor-code-1"] .cm-line')).toHaveLength(4)
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it("keeps keyboard exits and global undo outside CodeMirror history", async () => {
    const onExit = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(<CodeBlockEditor {...props({ onExit, onUndo, onRedo })} />)

    const content = screen.getByLabelText("Código")
    fireEvent.keyDown(content, { key: "Enter", shiftKey: true })
    fireEvent.keyDown(content, { key: "z", ctrlKey: true })
    fireEvent.keyDown(content, { key: "z", ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(content, { key: "y", ctrlKey: true })

    expect(onExit).toHaveBeenCalledOnce()
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onRedo).toHaveBeenCalledTimes(2)
  })

  it("keeps the highlighted editor visible but not editable in read-only mode", async () => {
    render(<CodeBlockEditor {...props({ readOnly: true })} />)

    const content = screen.getByLabelText("Código")
    await waitFor(() => expect(content).toHaveAttribute("contenteditable", "false"))
    expect(document.querySelector('[data-cy="code-editor-code-1"] .cm-line')).toBeInTheDocument()
  })
})
