import type {
  AiConversation,
  AiConversationHistory,
  AiMessage,
  AiRun,
  AiRunEvent,
  SendAiMessageInput,
} from "@reason/core/ai/contracts"
import { parseSseStream } from "@reason/core/ai/sse"
import { fetch } from "expo/fetch"

import { API_BASE_URL, ApiError } from "./api"

async function aiRequest<T>(
  path: string,
  token: string,
  init?: {
    method?: string
    body?: string
    signal?: AbortSignal
    headers?: Record<string, string>
  }
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? "ai_request_failed",
      payload?.message ?? "AI request failed"
    )
  }
  return payload as T
}

function conversationsPath(workspaceId: string) {
  return `/workspaces/${workspaceId}/ai/conversations`
}

function getRun(
  token: string,
  workspaceId: string,
  runId: string,
  signal?: AbortSignal
) {
  return aiRequest<AiRun>(
    `/workspaces/${workspaceId}/ai/runs/${runId}`,
    token,
    { signal }
  )
}

export const aiTransport = {
  listConversations: (
    token: string,
    workspaceId: string,
    signal?: AbortSignal
  ) =>
    aiRequest<AiConversation[]>(conversationsPath(workspaceId), token, {
      signal,
    }),

  createConversation: (
    token: string,
    workspaceId: string,
    signal?: AbortSignal
  ) =>
    aiRequest<AiConversation>(conversationsPath(workspaceId), token, {
      method: "POST",
      body: JSON.stringify({}),
      signal,
    }),

  getConversation: async (
    token: string,
    workspaceId: string,
    conversationId: string,
    signal?: AbortSignal
  ): Promise<AiConversationHistory> => {
    const [conversations, messages] = await Promise.all([
      aiRequest<AiConversation[]>(conversationsPath(workspaceId), token, {
        signal,
      }),
      aiRequest<AiMessage[]>(
        `${conversationsPath(workspaceId)}/${conversationId}/messages`,
        token,
        { signal }
      ),
    ])
    const conversation = conversations.find(
      (item) => item.id === conversationId
    )
    if (!conversation) throw new Error("Conversation not found")
    return { conversation, messages }
  },

  async streamMessage(
    token: string,
    workspaceId: string,
    conversationId: string,
    input: SendAiMessageInput,
    onEvent: (event: AiRunEvent) => void,
    signal?: AbortSignal
  ) {
    const actionName = input.action.type
    const response = await fetch(
      `${API_BASE_URL}/workspaces/${workspaceId}/ai/actions/${actionName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          conversationId,
          pageId:
            input.action.type === "summarize_page" ||
            input.action.type === "workspace_agent"
              ? input.action.page_id
              : undefined,
          selection:
            input.action.type === "workspace_agent"
              ? input.action.selection
              : [],
          mentionedPageIds:
            input.action.type === "workspace_agent"
              ? input.action.mentioned_page_ids
              : undefined,
          prompt: input.prompt,
        }),
        signal,
      }
    )
    if (!response.ok || !response.body) {
      let message = "Nao foi possivel iniciar a resposta."
      try {
        const payload = await response.json()
        message = payload.message ?? message
      } catch {
        // The response may not be JSON.
      }
      throw new ApiError(response.status, "ai_stream_failed", message)
    }

    let runId: string | undefined
    let terminal:
      Extract<AiRunEvent, { type: "run_completed" | "run_failed" }> | undefined

    await parseSseStream(response.body, (event) => {
      if (event.type === "run_started") runId = event.run_id
      if (
        (event.type === "run_completed" || event.type === "run_failed") &&
        (!event.group_id || typeof event.last_seq !== "number")
      ) {
        terminal = event
        return
      }
      onEvent(event)
    })

    if (!terminal) return
    const terminalRunId = terminal.run_id ?? runId
    if (!terminalRunId) {
      onEvent(terminal)
      return
    }
    const run = await getRun(token, workspaceId, terminalRunId, signal)
    const metadata = {
      run_id: terminalRunId,
      group_id: terminal.group_id ?? run.operation_group_id ?? undefined,
      last_seq: terminal.last_seq ?? run.last_seq ?? undefined,
    }
    if (terminal.type === "run_completed") {
      onEvent({ ...terminal, ...metadata })
    } else {
      onEvent({
        ...terminal,
        ...metadata,
        message: run.error ?? terminal.message,
      })
    }
  },
}
