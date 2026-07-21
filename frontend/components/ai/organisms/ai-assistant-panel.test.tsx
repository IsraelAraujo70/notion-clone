import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AiAssistantPanel } from "./ai-assistant-panel"

function renderPanel(
  overrides: Partial<Parameters<typeof AiAssistantPanel>[0]> = {}
) {
  const props: Parameters<typeof AiAssistantPanel>[0] = {
    showHistory: false,
    conversations: [],
    pages: [],
    messages: [],
    activities: [],
    streamedText: "",
    tools: [],
    approvals: [],
    busy: false,
    stopping: false,
    error: null,
    status: null,
    draft: "",
    mentionedPageIds: [],
    canWrite: true,
    pageId: "page-1",
    pageBlockIds: [],
    selectedBlockIds: [],
    onNewConversation: vi.fn(),
    onToggleHistory: vi.fn(),
    onSelectConversation: vi.fn(),
    onAction: vi.fn(),
    onOpenCitation: vi.fn(),
    onDraftChange: vi.fn(),
    onMentionPage: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onApprovalDecision: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<AiAssistantPanel {...props} />)
  return props
}

describe("AiAssistantPanel", () => {
  it("overlays the composer and reserves transcript space below it", () => {
    renderPanel({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "A long response",
          created_at: "now",
        },
      ],
    })

    expect(screen.getByTestId("ai-composer-overlay")).toHaveClass(
      "absolute",
      "bottom-0"
    )
    expect(screen.getByRole("log")).toHaveStyle({ paddingBottom: "152px" })
  })

  it("groups tool calls behind one compact activity row", async () => {
    renderPanel({
      tools: [
        { id: "tool-1", name: "search_workspace", status: "completed" },
        { id: "tool-2", name: "read_page", status: "completed" },
      ],
    })

    const activity = screen.getByRole("button", { name: /2 tools/i })
    expect(activity).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Search workspace")).not.toBeInTheDocument()

    await userEvent.click(activity)
    expect(screen.getByText("Search workspace")).toBeVisible()
    expect(screen.getByText("Read page")).toBeVisible()
  })

  it("requires an explicit decision for each proposed operation", async () => {
    const onApprovalDecision = vi.fn()
    renderPanel({
      approvals: [
        {
          runId: "run-1",
          proposalId: "proposal-1",
          status: "pending",
          operation: {
            type: "insert_block",
            opId: "op-1",
            parentId: "root-1",
            index: 0,
            block: {
              id: "page-1",
              workspaceId: "workspace-1",
              type: "page",
              properties: { title: "Cake recipe" },
              content: [],
              parentId: "root-1",
              trashedAt: null,
              trashedIndex: null,
            },
          },
        },
      ],
      onApprovalDecision,
    })

    expect(screen.getByText("Create page")).toBeVisible()
    expect(screen.getByText("Cake recipe")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Allow once" }))
    expect(onApprovalDecision).toHaveBeenCalledWith(
      "proposal-1",
      true,
      undefined
    )
  })

  it("allows future operations in the active conversation", async () => {
    const onApprovalDecision = vi.fn()
    renderPanel({
      approvals: [
        {
          runId: "run-1",
          proposalId: "proposal-1",
          status: "pending",
          operation: {
            type: "delete_block",
            opId: "op-1",
            blockId: "block-1",
          },
        },
      ],
      onApprovalDecision,
    })

    await userEvent.click(
      screen.getByRole("button", { name: "Allow in this conversation" })
    )
    expect(onApprovalDecision).toHaveBeenCalledWith(
      "proposal-1",
      true,
      true
    )
  })

  it("keeps auto-approved operations in the activity group", () => {
    renderPanel({
      busy: true,
      tools: [
        { id: "tool-1", name: "apply_operations", status: "running" },
      ],
      approvals: [
        {
          runId: "run-1",
          proposalId: "proposal-1",
          status: "applying",
          operation: {
            type: "insert_block",
            opId: "op-1",
            parentId: "root-1",
            index: 0,
            block: {
              id: "block-1",
              workspaceId: "workspace-1",
              type: "paragraph",
              properties: { text: "Ingredients" },
              content: [],
              parentId: "root-1",
              trashedAt: null,
              trashedIndex: null,
            },
          },
        },
      ],
    })

    expect(
      screen.queryByRole("button", { name: "Allow in this conversation" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Working/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getByText("Ingredients")).toBeVisible()
  })

  it("exposes an accessible header, history disclosure, and close action", async () => {
    const props = renderPanel()

    expect(screen.getByRole("heading", { name: "Reason AI" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Conversation history" })
    ).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(
      screen.getByRole("button", { name: "Close Reason AI" })
    )
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it("describes cancellation honestly as stopping only the local display", () => {
    renderPanel({
      busy: true,
      status: "Stopping local display only...",
    })

    expect(screen.getByRole("button", { name: "Stop display" })).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Stopping local display only"
    )
  })

  it("offers only matching workspace pages for @ mentions", async () => {
    const props = renderPanel({
      draft: "Compare @atlas",
      pages: [
        {
          id: "page-1",
          title: "Project Atlas",
          icon: "🏙️",
          parent_page_id: null,
        },
        { id: "page-2", title: "Roadmap", icon: "", parent_page_id: null },
      ],
    })

    expect(screen.getByRole("listbox", { name: "Mention page" })).toBeVisible()
    expect(screen.getByText(/Project Atlas/)).toBeVisible()
    expect(screen.queryByText("Roadmap")).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole("option", { name: /Project Atlas/ }))
    expect(props.onMentionPage).toHaveBeenCalledWith(
      "page-1",
      "Compare @Project Atlas "
    )
  })
})
