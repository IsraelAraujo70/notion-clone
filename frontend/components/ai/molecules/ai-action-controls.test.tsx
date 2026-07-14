import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AiActionControls } from "./ai-action-controls"

describe("AiActionControls", () => {
  it("disables all mutating actions for viewers", () => {
    render(
      <AiActionControls
        canWrite={false}
        pageId="page-1"
        pageBlockIds={["a"]}
        selectedBlockIds={["a"]}
        onAction={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: /Resumir/ })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /Formatar seleção/ })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /Formatar página/ })
    ).toBeDisabled()
  })

  it("preserves selected block order in a transform action", async () => {
    const onAction = vi.fn()
    render(
      <AiActionControls
        canWrite
        pageId="page-1"
        pageBlockIds={["a", "b"]}
        selectedBlockIds={["b", "a"]}
        onAction={onAction}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: /Formatar seleção/ })
    )
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transform_selection",
        block_ids: ["b", "a"],
      }),
      "Improve clarity and formatting"
    )
  })
})
