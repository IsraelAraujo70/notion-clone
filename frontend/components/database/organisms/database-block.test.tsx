import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DatabaseBlock } from "./database-block"
import {
  databaseProperties,
  defaultDatabaseProperties,
} from "@reason/core/database"
import { newBlock } from "@reason/core/engine/tree"

function props(view: "table" | "board" = "table") {
  const block = newBlock("database", {
    ...defaultDatabaseProperties(),
    title: "Tasks",
    view,
  })
  const rows = [
    newBlock("database_row", {
      title: "Ship database",
      status: "not_started",
    }),
    newBlock("database_row", {
      title: "Write tests",
      status: "done",
    }),
  ]
  return {
    block,
    rows,
    readOnly: false,
    onUpdateDatabase: vi.fn(),
    onAddRow: vi.fn(),
    onUpdateRow: vi.fn(),
    onDeleteRow: vi.fn(),
    onDeleteProperty: vi.fn(),
    onOpenRow: vi.fn(),
    onCommit: vi.fn(),
  }
}

describe("DatabaseBlock", () => {
  it("edits the shared rows in table view", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    expect(screen.getByDisplayValue("Ship database")).toBeVisible()
    fireEvent.change(screen.getAllByRole("textbox", { name: "Row title" })[0], {
      target: { value: "Ship phase one" },
    })
    expect(editorProps.onUpdateRow).toHaveBeenCalledWith(
      editorProps.rows[0].id,
      { title: "Ship phase one" },
      `database-row-title:${editorProps.rows[0].id}`
    )

    fireEvent.click(screen.getByRole("button", { name: "New row" }))
    expect(editorProps.onAddRow).toHaveBeenCalledWith("not_started")
  })

  it("switches to the board without changing row data", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(screen.getByRole("button", { name: "Board" }))
    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({ view: "board" })
  })

  it("moves a card to another status through the board drop target", () => {
    const editorProps = props("board")
    const { container } = render(<DatabaseBlock {...editorProps} />)
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: "move",
      types: ["application/x-reason-database-row"],
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => data.set(type, value),
    }

    fireEvent.dragStart(
      screen.getByDisplayValue("Ship database").closest("article")!,
      {
        dataTransfer,
      }
    )
    fireEvent.drop(
      container.querySelector('[data-cy="database-column-in_progress"]')!,
      { dataTransfer }
    )

    expect(editorProps.onUpdateRow).toHaveBeenCalledWith(
      editorProps.rows[0].id,
      { status: "in_progress" }
    )

    data.set("application/x-reason-database-row", "row-from-another-database")
    fireEvent.drop(
      container.querySelector('[data-cy="database-column-done"]')!,
      { dataTransfer }
    )
    expect(editorProps.onUpdateRow).toHaveBeenCalledTimes(1)
  })

  it("reorders status columns through the board drag handle", () => {
    const editorProps = props("board")
    const { container } = render(<DatabaseBlock {...editorProps} />)
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: "move",
      types: ["application/x-reason-database-status"],
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => data.set(type, value),
    }

    fireEvent.dragStart(
      screen.getByRole("button", { name: "Move status: Not started" }),
      { dataTransfer }
    )
    fireEvent.drop(
      container.querySelector('[data-cy="database-column-done"]')!,
      { dataTransfer }
    )

    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({
      statuses: [
        expect.objectContaining({ id: "in_progress" }),
        expect.objectContaining({ id: "done" }),
        expect.objectContaining({ id: "not_started" }),
      ],
    })
  })

  it("changes a status color from its column header", () => {
    const editorProps = props("board")
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(
      screen.getByRole("button", { name: "Status color: Not started" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Red" }))

    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({
      statuses: [
        expect.objectContaining({ id: "not_started", color: "red" }),
        expect.objectContaining({ id: "in_progress", color: "blue" }),
        expect.objectContaining({ id: "done", color: "green" }),
      ],
    })
  })

  it("adds dynamic properties from the property type menu", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "New property" }),
      {
        button: 0,
        ctrlKey: false,
      }
    )
    fireEvent.click(screen.getByRole("menuitem", { name: "Number" }))
    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({
      schema: [
        expect.objectContaining({ id: "title", type: "title" }),
        expect.objectContaining({ id: "status", type: "status" }),
        expect.objectContaining({ name: "Number", type: "number" }),
      ],
    })
  })

  it("adds another status option from the status property menu", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(
      screen.getByRole("button", { name: "Property options: Status" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Add status option" }))
    expect(editorProps.onUpdateDatabase).toHaveBeenLastCalledWith({
      statuses: expect.arrayContaining([
        expect.objectContaining({ name: "Status 4" }),
      ]),
    })
  })

  it("opens a database row as a subpage", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Open row" })[0]!)
    expect(editorProps.onOpenRow).toHaveBeenCalledWith(editorProps.rows[0].id)
  })

  it("shows the row page emoji in the clickable page icon", () => {
    const editorProps = props("board")
    editorProps.rows[0]!.properties.icon = "🔥"
    render(<DatabaseBlock {...editorProps} />)

    const openButton = screen.getAllByRole("button", { name: "Open row" })[0]!
    expect(openButton).toHaveTextContent("🔥")
    fireEvent.click(openButton)
    expect(editorProps.onOpenRow).toHaveBeenCalledWith(editorProps.rows[0].id)
  })

  it("persists a resized property width", () => {
    const editorProps = props()
    render(<DatabaseBlock {...editorProps} />)

    const handle = screen.getAllByRole("separator", {
      name: "Resize property",
    })[0]!
    fireEvent.pointerDown(handle, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 180 })
    fireEvent.pointerUp(window)

    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith(
      {
        schema: [
          expect.objectContaining({ id: "title", width: expect.any(Number) }),
          expect.objectContaining({ id: "status" }),
        ],
      },
      `database-property-width:${editorProps.block.id}:title`
    )
    expect(editorProps.onCommit).toHaveBeenCalled()
  })

  it("moves and deletes non-title properties", () => {
    const editorProps = props()
    editorProps.block.properties.schema = [
      { id: "title", name: "Name", type: "title" },
      { id: "status", name: "Status", type: "status" },
      { id: "details", name: "Details", type: "text" },
    ]
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(
      screen.getByRole("button", { name: "Property options: Details" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Move left" }))
    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({
      schema: [
        expect.objectContaining({ id: "title" }),
        expect.objectContaining({ id: "details" }),
        expect.objectContaining({ id: "status" }),
      ],
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete property" }))
    expect(editorProps.onDeleteProperty).toHaveBeenCalledWith("details", {
      schema: [
        expect.objectContaining({ id: "title" }),
        expect.objectContaining({ id: "status" }),
      ],
    })
  })

  it("creates and selects tags while keeping a per-property catalog", () => {
    const editorProps = props()
    editorProps.block.properties.schema = [
      { id: "title", name: "Name", type: "title" },
      { id: "status", name: "Status", type: "status" },
      { id: "labels", name: "Tags", type: "tags", options: ["backend"] },
    ]
    render(<DatabaseBlock {...editorProps} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Tags" })[0]!)
    const input = screen.getByRole("textbox", { name: "Find or create tag" })
    fireEvent.change(input, { target: { value: "frontend" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(editorProps.onUpdateDatabase).toHaveBeenCalledWith({
      schema: expect.arrayContaining([
        expect.objectContaining({
          id: "labels",
          options: ["backend", "frontend"],
        }),
      ]),
    })
    expect(editorProps.onUpdateRow).toHaveBeenCalledWith(
      editorProps.rows[0].id,
      { labels: ["frontend"] },
      undefined
    )
  })

  it("edits dates as ISO date strings", () => {
    const editorProps = props()
    editorProps.block.properties.schema = [
      { id: "title", name: "Name", type: "title" },
      { id: "due", name: "Due", type: "date" },
    ]
    const { rerender } = render(<DatabaseBlock {...editorProps} />)

    fireEvent.change(screen.getAllByLabelText("Due")[0]!, {
      target: { value: "2026-07-18" },
    })
    expect(editorProps.onUpdateRow).toHaveBeenCalledWith(
      editorProps.rows[0].id,
      { due: "2026-07-18" },
      `database-row-property:${editorProps.rows[0].id}:due`
    )

    editorProps.rows[0]!.properties.due = "2026-07-18"
    rerender(<DatabaseBlock {...editorProps} />)
    fireEvent.change(screen.getAllByLabelText("Due")[0]!, {
      target: { value: "" },
    })
    expect(editorProps.onUpdateRow).toHaveBeenLastCalledWith(
      editorProps.rows[0].id,
      { due: null },
      `database-row-property:${editorProps.rows[0].id}:due`
    )
  })

  it("gives board dates a full-width row below their label", () => {
    const editorProps = props("board")
    editorProps.block.properties.schema = [
      { id: "title", name: "Name", type: "title" },
      { id: "status", name: "Status", type: "status" },
      { id: "due", name: "Due", type: "date" },
    ]
    editorProps.rows[0]!.properties.due = "2026-07-18"
    render(<DatabaseBlock {...editorProps} />)

    const dateInput = screen.getAllByLabelText("Due")[0]!
    expect(dateInput).toHaveClass("w-full", "min-w-0")
    expect(dateInput.parentElement?.parentElement).toHaveClass(
      "flex-col",
      "gap-0.5"
    )
  })

  it("fills the available width and exposes horizontal overflow", () => {
    const editorProps = props()
    const { container } = render(<DatabaseBlock {...editorProps} />)
    const section = container.querySelector(
      `[data-cy="database-block-${editorProps.block.id}"]`
    )!
    const grid = section.querySelector("table")!.parentElement!

    expect(section).toHaveClass("w-full", "overflow-x-auto")
    expect(grid).toHaveClass("min-w-full")
    expect(grid.style.width).toMatch(/px$/)
  })

  it("parses tags and dates without restoring a deleted status property", () => {
    expect(
      databaseProperties({
        schema: [
          { id: "title", name: "Name", type: "title" },
          {
            id: "labels",
            name: "Tags",
            type: "tags",
            options: ["backend", "backend", "frontend"],
          },
          { id: "due", name: "Due", type: "date" },
        ],
      })
    ).toEqual([
      { id: "title", name: "Name", type: "title" },
      {
        id: "labels",
        name: "Tags",
        type: "tags",
        options: ["backend", "frontend"],
      },
      { id: "due", name: "Due", type: "date" },
    ])
  })

  it("normalizes title and status to their canonical row keys", () => {
    expect(
      databaseProperties({
        schema: [
          { id: "legacy-status", name: "Stage", type: "status" },
          { id: "legacy-title", name: "Task", type: "title" },
          { id: "another-title", name: "Duplicate", type: "title" },
          { id: "status", name: "Conflicting text", type: "text" },
        ],
      })
    ).toEqual([
      { id: "title", name: "Task", type: "title" },
      { id: "status", name: "Stage", type: "status" },
    ])
  })
})
