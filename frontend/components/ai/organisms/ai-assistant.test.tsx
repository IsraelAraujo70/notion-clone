import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { aiTransport } from "@/lib/ai/transport"
import {
  activeConversationStorageKey,
  conversationActivityStorageKey,
} from "@/lib/ai/conversation-state"
import { AiAssistant } from "./ai-assistant"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@/components/dashboard/dashboard-tabs", () => ({
  useDashboardTabs: () => ({ openPath: vi.fn() }),
}))
vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({ selectWorkspace: vi.fn() }),
}))
vi.mock("@/lib/ai/transport", () => ({
  aiTransport: {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    streamMessage: vi.fn(),
    decideOperation: vi.fn(),
    waitForRun: vi.fn(),
  },
}))

const conversation = {
  id: "conversation-1",
  workspace_id: "workspace-1",
  title: "",
  created_at: "2026-07-14T12:00:00Z",
  updated_at: "2026-07-14T12:00:00Z",
}

describe("AiAssistant", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.mocked(aiTransport.listConversations).mockClear()
    vi.mocked(aiTransport.createConversation).mockClear()
    vi.mocked(aiTransport.getConversation).mockClear()
    vi.mocked(aiTransport.streamMessage).mockClear()
    vi.mocked(aiTransport.decideOperation).mockClear()
    vi.mocked(aiTransport.waitForRun).mockClear()
    vi.mocked(aiTransport.listConversations).mockResolvedValue([])
    vi.mocked(aiTransport.createConversation).mockResolvedValue(conversation)
    vi.mocked(aiTransport.getConversation).mockResolvedValue({
      conversation,
      messages: [],
    })
    vi.mocked(aiTransport.streamMessage).mockResolvedValue(undefined)
    vi.mocked(aiTransport.decideOperation).mockResolvedValue({ ok: true })
    vi.mocked(aiTransport.waitForRun).mockResolvedValue({
      id: "run-1",
      workspace_id: "workspace-1",
      conversation_id: "conversation-1",
      action: "summarize_page",
      status: "completed",
      model: "test",
      operation_group_id: "group-1",
      error: null,
      last_seq: 7,
      created_at: "now",
      deadline_at: "later",
      completed_at: "now",
    })
  })

  it("waits for pending editor operations before starting a mutating action", async () => {
    let releaseDrain = () => {}
    const drained = new Promise<void>((resolve) => {
      releaseDrain = resolve
    })

    render(
      <AiAssistant
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageId="page-1"
        pageBlockIds={["block-1"]}
        selectedBlockIds={[]}
        anchorBlockId="block-1"
        canWrite
        requestedAction={{ type: "summarize_page", page_id: "page-1" }}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => drained}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: "Send" }))
    expect(aiTransport.createConversation).not.toHaveBeenCalled()
    expect(aiTransport.streamMessage).not.toHaveBeenCalled()

    releaseDrain()
    await waitFor(() =>
      expect(aiTransport.streamMessage).toHaveBeenCalledOnce()
    )
  })

  it("sends selected @ pages as structured workspace context", async () => {
    render(
      <AiAssistant
        token="token"
        workspaceId="workspace-1"
        pages={[
          {
            id: "page-2",
            title: "Project Atlas",
            icon: "🏙️",
            parent_page_id: null,
          },
        ]}
        pageId="page-1"
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.click(
      screen.getByRole("button", { name: "Open Reason AI" })
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Compare @atlas"
    )
    await userEvent.click(await screen.findByText(/Project Atlas/))
    await userEvent.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(aiTransport.streamMessage).toHaveBeenCalledOnce()
    )
    expect(aiTransport.streamMessage).toHaveBeenCalledWith(
      "token",
      "workspace-1",
      "conversation-1",
      expect.objectContaining({
        prompt: "Compare @Project Atlas",
        action: expect.objectContaining({
          type: "workspace_agent",
          mentioned_page_ids: ["page-2"],
        }),
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    )
  })

  it("runs the full-page workspace assistant without page context or edit actions", async () => {
    render(
      <AiAssistant
        variant="page"
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite={false}
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    expect(screen.queryByRole("button", { name: "Close Reason AI" })).toBeNull()
    expect(screen.queryByText("Format page")).toBeNull()
    const input = screen.getByRole("textbox", { name: "Message to Reason AI" })
    await userEvent.type(input, "What changed this week?")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(aiTransport.streamMessage).toHaveBeenCalledOnce()
    )
    const inputPayload = vi.mocked(aiTransport.streamMessage).mock.calls[0][3]
    expect(inputPayload.action).toMatchObject({
      type: "workspace_agent",
      prompt: "What changed this week?",
      selection: [],
    })
    expect(inputPayload.action).not.toHaveProperty("page_id")
  })

  it("restores the active conversation after the assistant remounts", async () => {
    const persistedMessages = [
      {
        id: "message-1",
        role: "user" as const,
        content: "Keep this conversation",
        citations: undefined,
        created_at: "2026-07-14T12:01:00Z",
      },
      {
        id: "message-2",
        role: "assistant" as const,
        content: "Conversation restored",
        citations: undefined,
        created_at: "2026-07-14T12:02:00Z",
      },
    ]
    vi.mocked(aiTransport.listConversations)
      .mockResolvedValueOnce([])
      .mockResolvedValue([conversation])
    vi.mocked(aiTransport.getConversation).mockResolvedValue({
      conversation,
      messages: persistedMessages,
    })
    const props = {
      variant: "page" as const,
      token: "token",
      workspaceId: "workspace-1",
      pages: [],
      pageBlockIds: [],
      selectedBlockIds: [],
      anchorBlockId: null,
      canWrite: true,
      requestedAction: null,
      onRequestedActionHandled: vi.fn(),
      onRunCompleted: vi.fn(),
      onBeforeMutatingAction: () => Promise.resolve(),
    }
    const view = render(<AiAssistant {...props} />)

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Keep this conversation"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(
          activeConversationStorageKey("workspace-1")
        )
      ).toBe("conversation-1")
    )
    await screen.findByText("Conversation restored")
    view.unmount()
    window.sessionStorage.setItem(
      conversationActivityStorageKey("workspace-1", "conversation-1"),
      JSON.stringify({
        tools: [
          { id: "run-1:0", name: "search_workspace", status: "completed" },
        ],
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
      })
    )

    render(<AiAssistant {...props} />)

    expect(await screen.findByText("Conversation restored")).toBeVisible()
    expect(
      await screen.findByRole("button", { name: /1 tools/i })
    ).toHaveAttribute("aria-expanded", "false")
    expect(await screen.findByText("Move to trash")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Allow once" }))
    expect(aiTransport.decideOperation).toHaveBeenCalledWith(
      "token",
      "workspace-1",
      "run-1",
      "proposal-1",
      true,
      false
    )
    expect(aiTransport.waitForRun).toHaveBeenCalledWith(
      "token",
      "workspace-1",
      "run-1",
      expect.any(AbortSignal)
    )
    expect(aiTransport.getConversation).toHaveBeenLastCalledWith(
      "token",
      "workspace-1",
      "conversation-1",
      expect.any(AbortSignal)
    )
  })

  it("condenses tool events into one completed activity group", async () => {
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        onEvent({
          type: "tool_started",
          tool: "search_workspace",
        })
        onEvent({ type: "tool_started", tool: "read_page" })
        onEvent({ type: "run_completed", run_id: "run-1" })
      }
    )
    render(
      <AiAssistant
        variant="page"
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Find the project notes"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(
      await screen.findByRole("button", { name: /2 tools/i })
    ).toHaveAttribute("aria-expanded", "false")
    await waitFor(() =>
      expect(
        JSON.parse(
          window.sessionStorage.getItem(
            conversationActivityStorageKey("workspace-1", "conversation-1")
          ) ?? "{}"
        ).tools
      ).toHaveLength(2)
    )

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Check the project notes again"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /2 tools/i })
      ).toHaveLength(2)
    )
    await waitFor(() => {
      const storedActivity = JSON.parse(
        window.sessionStorage.getItem(
          conversationActivityStorageKey("workspace-1", "conversation-1")
        ) ?? "{}"
      )
      expect(storedActivity.activities).toHaveLength(1)
      expect(storedActivity.tools).toHaveLength(2)
    })
  })

  it("asks before applying a workspace operation", async () => {
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        onEvent({
          type: "approval_requested",
          run_id: "run-1",
          proposal_id: "proposal-1",
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
        })
        await new Promise<void>(() => {})
      }
    )
    render(
      <AiAssistant
        variant="page"
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Create a cake recipe"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(await screen.findByText("Create page")).toBeVisible()
    await waitFor(() => {
      const stored = JSON.parse(
        window.sessionStorage.getItem(
          conversationActivityStorageKey("workspace-1", "conversation-1")
        ) ?? "{}"
      )
      expect(stored.approvals).toEqual([
        expect.objectContaining({
          proposalId: "proposal-1",
          status: "pending",
          operation: expect.objectContaining({ type: "insert_block" }),
        }),
      ])
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Allow in this conversation" })
    )

    expect(aiTransport.decideOperation).toHaveBeenCalledWith(
      "token",
      "workspace-1",
      "run-1",
      "proposal-1",
      true,
      true
    )
  })

  it("ignores conversation responses from the previous workspace", async () => {
    let resolveOld: (value: (typeof conversation)[]) => void = () => {}
    const oldRequest = new Promise<(typeof conversation)[]>((resolve) => {
      resolveOld = resolve
    })
    vi.mocked(aiTransport.listConversations).mockImplementation(
      (_token, workspaceId) =>
        workspaceId === "workspace-1"
          ? oldRequest
          : Promise.resolve([
              {
                ...conversation,
                id: "conversation-2",
                workspace_id: "workspace-2",
                title: "Current workspace",
              },
            ])
    )
    const common = {
      token: "token",
      pages: [],
      pageId: "page-1",
      pageBlockIds: [] as string[],
      selectedBlockIds: [] as string[],
      anchorBlockId: null,
      canWrite: true,
      requestedAction: null,
      onRequestedActionHandled: vi.fn(),
      onRunCompleted: vi.fn(),
      onBeforeMutatingAction: () => Promise.resolve(),
    }
    const { rerender } = render(
      <AiAssistant {...common} workspaceId="workspace-1" />
    )

    await waitFor(() =>
      expect(aiTransport.listConversations).toHaveBeenCalledWith(
        "token",
        "workspace-1",
        expect.any(AbortSignal)
      )
    )
    rerender(<AiAssistant {...common} workspaceId="workspace-2" />)
    await waitFor(() =>
      expect(aiTransport.listConversations).toHaveBeenCalledWith(
        "token",
        "workspace-2",
        expect.any(AbortSignal)
      )
    )
    resolveOld([
      {
        ...conversation,
        title: "Previous workspace",
      },
    ])

    await userEvent.click(
      screen.getByRole("button", { name: "Open Reason AI" })
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Conversation history" })
    )
    expect(await screen.findByText("Current workspace")).toBeVisible()
    expect(screen.queryByText("Previous workspace")).not.toBeInTheDocument()
  })

  it("polls a started run after local stream loss and finalizes its group", async () => {
    const onRunCompleted = vi.fn()
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        throw new TypeError("network lost")
      }
    )

    render(
      <AiAssistant
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageId="page-1"
        pageBlockIds={["block-1"]}
        selectedBlockIds={[]}
        anchorBlockId="block-1"
        canWrite
        requestedAction={{ type: "summarize_page", page_id: "page-1" }}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={onRunCompleted}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(aiTransport.waitForRun).toHaveBeenCalledWith(
        "token",
        "workspace-1",
        "run-1",
        expect.any(AbortSignal)
      )
    )
    expect(onRunCompleted).toHaveBeenCalledWith("group-1", 7)
  })

  it("cancels terminal-status polling when the workspace changes", async () => {
    let pollingSignal: AbortSignal | undefined
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        throw new TypeError("network lost")
      }
    )
    vi.mocked(aiTransport.waitForRun).mockImplementation(
      async (_token, _workspace, _run, signal) => {
        pollingSignal = signal
        return new Promise<never>(() => {})
      }
    )
    const common = {
      token: "token",
      pages: [],
      pageId: "page-1",
      pageBlockIds: ["block-1"],
      selectedBlockIds: [] as string[],
      anchorBlockId: "block-1",
      canWrite: true,
      requestedAction: {
        type: "summarize_page" as const,
        page_id: "page-1",
      },
      onRequestedActionHandled: vi.fn(),
      onRunCompleted: vi.fn(),
      onBeforeMutatingAction: () => Promise.resolve(),
    }
    const { rerender } = render(
      <AiAssistant {...common} workspaceId="workspace-1" />
    )
    await userEvent.click(await screen.findByRole("button", { name: "Send" }))
    await waitFor(() => expect(pollingSignal).toBeDefined())

    rerender(<AiAssistant {...common} workspaceId="workspace-2" />)

    await waitFor(() => expect(pollingSignal?.aborted).toBe(true))
  })

  it("does not poll a started run after the user stops local display", async () => {
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent, signal) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        })
      }
    )
    render(
      <AiAssistant
        variant="page"
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Keep researching"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "Stop display" })
    )

    await screen.findByText("Display stopped.")
    expect(aiTransport.waitForRun).not.toHaveBeenCalled()
  })

  it("stops recovery polling when the user stops local display", async () => {
    let pollingSignal: AbortSignal | undefined
    vi.mocked(aiTransport.streamMessage).mockImplementation(
      async (_token, _workspace, _conversation, _input, onEvent) => {
        onEvent({ type: "run_started", run_id: "run-1" })
        throw new TypeError("network lost")
      }
    )
    vi.mocked(aiTransport.waitForRun).mockImplementation(
      async (_token, _workspace, _run, signal) => {
        pollingSignal = signal
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        })
      }
    )
    render(
      <AiAssistant
        variant="page"
        token="token"
        workspaceId="workspace-1"
        pages={[]}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite
        requestedAction={null}
        onRequestedActionHandled={vi.fn()}
        onRunCompleted={vi.fn()}
        onBeforeMutatingAction={() => Promise.resolve()}
      />
    )

    await userEvent.type(
      screen.getByRole("textbox", { name: "Message to Reason AI" }),
      "Keep researching"
    )
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(pollingSignal).toBeDefined())
    await userEvent.click(
      screen.getByRole("button", { name: "Stop display" })
    )

    await waitFor(() => expect(pollingSignal?.aborted).toBe(true))
    await screen.findByText("Display stopped.")
  })

  it.each(["deciding", "applying"] as const)(
    "recovers a %s approval after remount",
    async (approvalStatus) => {
      window.sessionStorage.setItem(
        activeConversationStorageKey("workspace-1"),
        "conversation-1"
      )
      window.sessionStorage.setItem(
        conversationActivityStorageKey("workspace-1", "conversation-1"),
        JSON.stringify({
          tools: [],
          approvals: [
            {
              runId: "run-1",
              proposalId: "proposal-1",
              status: approvalStatus,
              decision: true,
              operation: {
                type: "delete_block",
                opId: "op-1",
                blockId: "block-1",
              },
            },
          ],
        })
      )
      vi.mocked(aiTransport.listConversations).mockResolvedValue([conversation])
      vi.mocked(aiTransport.getConversation).mockResolvedValue({
        conversation,
        messages: [],
      })

      render(
        <AiAssistant
          variant="page"
          token="token"
          workspaceId="workspace-1"
          pages={[]}
          pageBlockIds={[]}
          selectedBlockIds={[]}
          anchorBlockId={null}
          canWrite
          requestedAction={null}
          onRequestedActionHandled={vi.fn()}
          onRunCompleted={vi.fn()}
          onBeforeMutatingAction={() => Promise.resolve()}
        />
      )

      await waitFor(() =>
        expect(aiTransport.waitForRun).toHaveBeenCalledWith(
          "token",
          "workspace-1",
          "run-1",
          expect.any(AbortSignal)
        )
      )
    }
  )
})
