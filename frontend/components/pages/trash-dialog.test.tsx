import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TrashDialog } from "./trash-dialog"

const mocks = vi.hoisted(() => ({
  refreshTrash: vi.fn(),
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  canWrite: true,
}))

vi.mock("@/components/pages/page-provider", () => ({
  usePages: () => ({
    trash: [
      {
        id: "page-trash",
        type: "page",
        title: "Documento antigo",
        trashed_at: "2026-07-10T12:00:00Z",
      },
    ],
    refreshTrash: mocks.refreshTrash,
    restore: mocks.restore,
    permanentDelete: mocks.permanentDelete,
    canWrite: mocks.canWrite,
  }),
}))

describe("TrashDialog", () => {
  beforeEach(() => {
    mocks.canWrite = true
    mocks.refreshTrash.mockReset().mockResolvedValue(undefined)
    mocks.restore.mockReset().mockResolvedValue(undefined)
    mocks.permanentDelete.mockReset().mockResolvedValue({
      deleted_blocks: 2,
      media_cleanup_queued: 1,
    })
  })

  it("requires a second explicit confirmation before permanent deletion", async () => {
    render(<TrashDialog open onOpenChange={vi.fn()} />)
    await waitFor(() => expect(mocks.refreshTrash).toHaveBeenCalled())

    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(mocks.permanentDelete).not.toHaveBeenCalled()
    expect(
      screen.getByRole("heading", { name: "Delete permanently?" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/and its entire subtree will be removed/)
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole("button", { name: "Delete permanently" })
    )
    await waitFor(() =>
      expect(mocks.permanentDelete).toHaveBeenCalledWith("page-trash")
    )
  })

  it("hides restore and purge actions from viewers", async () => {
    mocks.canWrite = false
    render(<TrashDialog open onOpenChange={vi.fn()} />)
    await waitFor(() => expect(mocks.refreshTrash).toHaveBeenCalled())

    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
  })
})
