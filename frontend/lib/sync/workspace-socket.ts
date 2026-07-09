import type { Operation } from "@/lib/contracts"
import { api, type LoggedOperation } from "@/lib/api"

export type AppliedOpEvent = {
  workspace_id: string
  seq: number
  op_id: string
  actor_id: string
  operation: Operation
}

type ServerMessage =
  | { type: "hello"; latest_seq: number }
  | { type: "op"; event: AppliedOpEvent }
  | { type: "ping" }

export type WorkspaceSocketHandlers = {
  onOp: (event: AppliedOpEvent) => void
  onHello?: (latestSeq: number) => void
  onStatus?: (status: "connecting" | "open" | "closed") => void
}

const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

/**
 * WebSocket do workspace: recebe ops remotas + heartbeat.
 * Reconecta com backoff; o caller deve catch-up do cursor entre sessões.
 */
export function connectWorkspaceSocket(
  workspaceId: string,
  token: string,
  handlers: WorkspaceSocketHandlers
): { close: () => void } {
  let closed = false
  let socket: WebSocket | null = null
  let delay = BASE_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (closed) return
    clearReconnect()
    reconnectTimer = setTimeout(connect, delay)
    delay = Math.min(delay * 2, MAX_DELAY_MS)
  }

  function connect() {
    if (closed) return
    handlers.onStatus?.("connecting")
    const url = api.workspaceWsUrl(workspaceId, token)
    socket = new WebSocket(url)

    socket.onopen = () => {
      delay = BASE_DELAY_MS
      handlers.onStatus?.("open")
    }

    socket.onmessage = (message) => {
      let payload: ServerMessage
      try {
        payload = JSON.parse(String(message.data)) as ServerMessage
      } catch {
        return
      }
      if (payload.type === "hello") {
        handlers.onHello?.(payload.latest_seq)
        return
      }
      if (payload.type === "op") {
        handlers.onOp(payload.event)
        return
      }
      // ping: silencioso — a conexão viva basta; pong opcional no futuro
    }

    socket.onclose = () => {
      handlers.onStatus?.("closed")
      socket = null
      scheduleReconnect()
    }

    socket.onerror = () => {
      socket?.close()
    }
  }

  connect()

  return {
    close() {
      closed = true
      clearReconnect()
      socket?.close()
      socket = null
    },
  }
}

/** Puxa ops com seq > afterSeq e devolve a lista ordenada + latest_seq. */
export async function catchUpOperations(
  token: string,
  workspaceId: string,
  afterSeq: number
): Promise<{ operations: LoggedOperation[]; latestSeq: number }> {
  const page = await api.listOperations(token, workspaceId, afterSeq)
  return { operations: page.operations, latestSeq: page.latest_seq }
}
