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

    expect(screen.getByRole("button", { name: /Summarize/ })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /Format selection/ })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: /Format page/ })).toBeDisabled()
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
      screen.getByRole("button", { name: /Format selection/ })
    )
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transform_selection",
        block_ids: ["b", "a"],
      }),
      "Improve clarity and formatting"
    )
  })

  it("represents page formatting explicitly instead of sending root children", async () => {
    const onAction = vi.fn()
    render(
      <AiActionControls
        canWrite
        pageId="page-1"
        pageBlockIds={["direct-child"]}
        selectedBlockIds={["selected-child"]}
        onAction={onAction}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /Format page/ }))

    expect(onAction).toHaveBeenCalledWith(
      {
        type: "transform_page",
        page_id: "page-1",
        instruction: "Improve the page structure and formatting",
      },
      "Improve the page structure and formatting"
    )
  })
})
