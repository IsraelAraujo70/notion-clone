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
    streamedText: "",
    tools: [],
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
    onClose: vi.fn(),
    ...overrides,
  }
  render(<AiAssistantPanel {...props} />)
  return props
}

describe("AiAssistantPanel", () => {
  it("exposes an accessible header, history disclosure, and close action", async () => {
    const props = renderPanel()

    expect(screen.getByRole("heading", { name: "Reason AI" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Histórico de conversas" })
    ).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(
      screen.getByRole("button", { name: "Fechar Reason AI" })
    )
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it("describes cancellation honestly as stopping only the local display", () => {
    renderPanel({
      busy: true,
      status: "Interrompendo apenas a exibição local…",
    })

    expect(
      screen.getByRole("button", { name: "Interromper exibição" })
    ).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Interrompendo apenas a exibição local"
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

    expect(
      screen.getByRole("listbox", { name: "Mencionar página" })
    ).toBeVisible()
    expect(screen.getByText(/Project Atlas/)).toBeVisible()
    expect(screen.queryByText("Roadmap")).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole("option", { name: /Project Atlas/ }))
    expect(props.onMentionPage).toHaveBeenCalledWith(
      "page-1",
      "Compare @Project Atlas "
    )
  })
})
