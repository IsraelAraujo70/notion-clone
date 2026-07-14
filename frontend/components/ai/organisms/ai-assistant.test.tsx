import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { aiTransport } from "@/lib/ai/transport"
import { AiAssistant } from "./ai-assistant"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    waitForRun: vi.fn(),
  },
}))

const conversation = {
  id: "conversation-1",
  workspace_id: "workspace-1",
  title: "",
  created_at: "now",
  updated_at: "now",
}

describe("AiAssistant", () => {
  beforeEach(() => {
    vi.mocked(aiTransport.listConversations).mockClear()
    vi.mocked(aiTransport.createConversation).mockClear()
    vi.mocked(aiTransport.getConversation).mockClear()
    vi.mocked(aiTransport.streamMessage).mockClear()
    vi.mocked(aiTransport.waitForRun).mockClear()
    vi.mocked(aiTransport.listConversations).mockResolvedValue([])
    vi.mocked(aiTransport.createConversation).mockResolvedValue(conversation)
    vi.mocked(aiTransport.getConversation).mockResolvedValue({
      conversation,
      messages: [],
    })
    vi.mocked(aiTransport.streamMessage).mockResolvedValue(undefined)
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

    await userEvent.click(await screen.findByRole("button", { name: "Enviar" }))
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
      screen.getByRole("button", { name: "Abrir Reason AI" })
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Mensagem para Reason AI" }),
      "Compare @atlas"
    )
    await userEvent.click(await screen.findByText(/Project Atlas/))
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }))

    await waitFor(() => expect(aiTransport.streamMessage).toHaveBeenCalledOnce())
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
      screen.getByRole("button", { name: "Abrir Reason AI" })
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Histórico de conversas" })
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

    await userEvent.click(await screen.findByRole("button", { name: "Enviar" }))

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
    await userEvent.click(await screen.findByRole("button", { name: "Enviar" }))
    await waitFor(() => expect(pollingSignal).toBeDefined())

    rerender(<AiAssistant {...common} workspaceId="workspace-2" />)

    await waitFor(() => expect(pollingSignal?.aborted).toBe(true))
  })
})
