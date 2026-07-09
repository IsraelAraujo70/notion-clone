import type { Operation } from "@/lib/contracts"
import { api, type LoggedOperation, type PresencePeer } from "@/lib/api"

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
  | { type: "presence_snapshot"; peers: PresencePeer[] }
  | { type: "presence_update"; peer: PresencePeer }
  | { type: "presence_leave"; connection_id: string }

export type WorkspaceSocketHandlers = {
  onOp: (event: AppliedOpEvent) => void
  onHello?: (latestSeq: number) => void
  onStatus?: (status: "connecting" | "open" | "closed") => void
  onPresenceSnapshot?: (peers: PresencePeer[]) => void
  onPresenceUpdate?: (peer: PresencePeer) => void
  onPresenceLeave?: (connectionId: string) => void
}

const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

/**
 * WebSocket do workspace: recebe ops remotas, presence e heartbeat.
 * Reconecta com backoff; o caller deve catch-up do cursor entre sessões.
 */
export function connectWorkspaceSocket(
  workspaceId: string,
  token: string,
  handlers: WorkspaceSocketHandlers
): {
  close: () => void
  sendPresence: (pageId: string | null, focusedBlockId: string | null) => void
} {
  let closed = false
  let socket: WebSocket | null = null
  let delay = BASE_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let lastPresence: { pageId: string | null; focusedBlockId: string | null } = {
    pageId: null,
    focusedBlockId: null,
  }

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

  function flushPresence() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(
      JSON.stringify({
        type: "presence",
        page_id: lastPresence.pageId,
        focused_block_id: lastPresence.focusedBlockId,
      })
    )
  }

  function connect() {
    if (closed) return
    handlers.onStatus?.("connecting")
    const url = api.workspaceWsUrl(workspaceId, token)
    socket = new WebSocket(url)

    socket.onopen = () => {
      delay = BASE_DELAY_MS
      handlers.onStatus?.("open")
      flushPresence()
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
      if (payload.type === "presence_snapshot") {
        handlers.onPresenceSnapshot?.(payload.peers)
        return
      }
      if (payload.type === "presence_update") {
        handlers.onPresenceUpdate?.(payload.peer)
        return
      }
      if (payload.type === "presence_leave") {
        handlers.onPresenceLeave?.(payload.connection_id)
        return
      }
      // ping: silencioso — a conexão viva basta
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
    sendPresence(pageId, focusedBlockId) {
      lastPresence = { pageId, focusedBlockId }
      flushPresence()
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
