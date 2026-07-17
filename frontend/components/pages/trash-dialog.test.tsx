import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TrashEntry } from "@/lib/api"

import { TrashDialog } from "./trash-dialog"

const mocks = vi.hoisted(() => ({
  refreshTrash: vi.fn(),
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  canWrite: true,
  trash: [] as TrashEntry[],
}))

vi.mock("@/components/pages/page-provider", () => ({
  usePages: () => ({
    trash: mocks.trash,
    refreshTrash: mocks.refreshTrash,
    restore: mocks.restore,
    permanentDelete: mocks.permanentDelete,
    canWrite: mocks.canWrite,
  }),
}))

describe("TrashDialog", () => {
  beforeEach(() => {
    mocks.canWrite = true
    mocks.trash = [
      {
        id: "page-trash",
        type: "page",
        title: "Documento antigo",
        trashed_at: "2026-07-10T12:00:00Z",
        page_id: "page-trash",
        page_title: "Documento antigo",
      },
    ]
    mocks.refreshTrash.mockReset().mockResolvedValue(undefined)
    mocks.restore.mockReset().mockResolvedValue(undefined)
    mocks.permanentDelete.mockReset().mockResolvedValue({
      deleted_blocks: 2,
      media_cleanup_queued: 1,
    })
  })

  it("separates pages from blocks and shows the nearest page context", async () => {
    mocks.trash = [
      ...mocks.trash,
      {
        id: "paragraph-trash",
        type: "paragraph",
        title: "Follow-up notes",
        trashed_at: "2026-07-09T12:00:00Z",
        page_id: "project-page",
        page_title: "Project notes",
      },
      {
        id: "divider-trash",
        type: "divider",
        title: "",
        trashed_at: "2026-07-08T12:00:00Z",
        page_id: null,
        page_title: null,
      },
    ]

    render(<TrashDialog open onOpenChange={vi.fn()} />)

    expect(
      await screen.findByRole("heading", { name: "Pages" })
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Blocks" })).toBeInTheDocument()
    expect(screen.getByText("In Project notes")).toBeInTheDocument()
    expect(screen.getAllByText(/^In /)).toHaveLength(1)
    expect(screen.getByText("Paragraph")).toBeInTheDocument()
    expect(screen.getAllByText("Divider")).toHaveLength(2)
    expect(screen.getByText("Documento antigo").closest("li")).toHaveAttribute(
      "data-trash-kind",
      "page"
    )
    expect(screen.getByText("Follow-up notes").closest("li")).toHaveAttribute(
      "data-trash-kind",
      "block"
    )
  })

  it("keeps the header fixed and exposes a keyboard-scrollable dialog body", async () => {
    render(<TrashDialog open onOpenChange={vi.fn()} />)
    const region = await screen.findByRole("region", {
      name: "Trash contents",
    })

    expect(screen.getByRole("dialog")).toHaveClass(
      "max-h-[calc(100dvh-1rem)]",
      "overflow-hidden"
    )
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveClass("min-h-0", "overflow-y-auto")
  })

  it("constrains long page context labels on mobile", async () => {
    const longPageTitle = "Project context ".repeat(20)
    mocks.trash = [
      {
        id: "paragraph-trash",
        type: "paragraph",
        title: "Draft",
        trashed_at: "2026-07-09T12:00:00Z",
        page_id: "project-page",
        page_title: longPageTitle,
      },
    ]
    render(<TrashDialog open onOpenChange={vi.fn()} />)

    const context = await screen.findByText(/^In Project context/)
    expect(context).toHaveClass("min-w-0", "max-w-full", "truncate")
    expect(context.parentElement).toHaveClass("min-w-0", "flex-wrap")
  })

  it("restores an individual non-page block", async () => {
    mocks.trash = [
      {
        id: "heading-trash",
        type: "heading2",
        title: "Archived section",
        trashed_at: "2026-07-09T12:00:00Z",
        page_id: "project-page",
        page_title: "Project notes",
      },
    ]
    render(<TrashDialog open onOpenChange={vi.fn()} />)
    const entry = (await screen.findByText("Archived section")).closest("li")

    await userEvent.click(
      within(entry as HTMLElement).getByRole("button", { name: "Restore" })
    )

    await waitFor(() =>
      expect(mocks.restore).toHaveBeenCalledWith("heading-trash")
    )
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

  it("renders the empty state inside the scrollable body", async () => {
    mocks.trash = []
    render(<TrashDialog open onOpenChange={vi.fn()} />)

    expect(await screen.findByText("Empty trash")).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Trash contents" })
    ).toContainElement(
      screen.getByText("Nothing has been deleted in this workspace.")
    )
  })
})
