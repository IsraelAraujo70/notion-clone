import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommentEditor } from "./comment-editor"

describe("CommentEditor", () => {
  it("is controlled, labels the selected range, and rejects blank comments", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(
      <CommentEditor
        selection={{
          path: "src/file.ts",
          side: "RIGHT",
          startLine: 3,
          endLine: 5,
        }}
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText("Comment on right lines 3-5")).toBeVisible()
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled()
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "A comment" },
    })
    expect(onChange).toHaveBeenCalledWith("A comment")
    fireEvent.submit(screen.getByRole("textbox").closest("form")!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits a non-empty controlled value and supports cancel", () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(
      <CommentEditor
        selection={{
          path: "src/file.ts",
          side: "LEFT",
          startLine: 8,
          endLine: 8,
        }}
        value="Looks risky"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
