import { API_BASE_URL, ApiError } from "@/lib/api"
import type {
  AiConversation,
  AiConversationHistory,
  AiMessage,
  AiRun,
  AiRunEvent,
  SendAiMessageInput,
} from "./contracts"
import { parseSseStream } from "./sse"

async function aiRequest<T>(path: string, token: string, init?: RequestInit) {
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

function wait(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export const aiTransport = {
  getRun,
  async waitForRun(
    token: string,
    workspaceId: string,
    runId: string,
    signal?: AbortSignal,
    options: { attempts?: number; intervalMs?: number } = {}
  ) {
    const attempts = options.attempts ?? 20
    const intervalMs = options.intervalMs ?? 500
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const run = await getRun(token, workspaceId, runId, signal)
        if (run.status === "completed" || run.status === "failed") return run
      } catch (caught) {
        if (signal?.aborted) throw caught
        lastError = caught
      }
      if (attempt < attempts - 1) await wait(intervalMs, signal)
    }
    if (lastError instanceof Error) throw lastError
    throw new Error("AI run status polling timed out")
  },
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
  getConversation: (
    token: string,
    workspaceId: string,
    conversationId: string,
    signal?: AbortSignal
  ) =>
    Promise.all([
      aiRequest<AiConversation[]>(conversationsPath(workspaceId), token, {
        signal,
      }),
      aiRequest<AiMessage[]>(
        `${conversationsPath(workspaceId)}/${conversationId}/messages`,
        token,
        { signal }
      ),
    ]).then(
      ([conversations, messages]) =>
        ({
          conversation: conversations.find(
            (item) => item.id === conversationId
          )!,
          messages: messages.map((message) => ({
            ...message,
            citations: message.citations?.filter(
              (citation) =>
                typeof citation === "object" &&
                citation !== null &&
                typeof citation.workspace_id === "string" &&
                typeof citation.page_id === "string" &&
                typeof citation.page_title === "string" &&
                typeof citation.block_id === "string" &&
                typeof citation.snippet === "string"
            ),
          })),
        }) satisfies AiConversationHistory
    ),
  async streamMessage(
    token: string,
    workspaceId: string,
    conversationId: string,
    input: SendAiMessageInput,
    onEvent: (event: AiRunEvent) => void,
    signal?: AbortSignal
  ) {
    const actionName = input.action.type
    const selection =
      input.action.type === "transform_selection"
        ? input.action.block_ids
        : input.action.type === "continue_writing"
          ? [input.action.anchor_block_id]
          : input.action.type === "workspace_agent"
            ? [
                ...new Set([
                  ...(input.action.anchor_block_id
                    ? [input.action.anchor_block_id]
                    : []),
                  ...input.action.selection,
                ]),
              ]
            : []
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
          selection,
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
      let message = "Não foi possível iniciar a resposta."
      try {
        const payload = await response.json()
        message = payload.message ?? message
      } catch {
        // The response may not be JSON.
      }
      throw new ApiError(response.status, "ai_stream_failed", message)
    }
    const pendingTerminal: {
      event?: Extract<AiRunEvent, { type: "run_completed" | "run_failed" }>
    } = {}
    let runId: string | undefined
    let sawTerminal = false
    await parseSseStream(response.body, (event) => {
      if (event.type === "run_started") runId = event.run_id
      if (event.type === "run_completed" || event.type === "run_failed") {
        sawTerminal = true
      }
      if (
        (event.type === "run_completed" || event.type === "run_failed") &&
        (!event.group_id || typeof event.last_seq !== "number") &&
        (event.run_id || runId)
      ) {
        pendingTerminal.event = event
        return
      }
      onEvent(event)
    })
    if (pendingTerminal.event) {
      const terminal = pendingTerminal.event
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
    } else if (runId && !sawTerminal) {
      throw new Error("AI stream ended before a terminal event")
    }
  },
}
