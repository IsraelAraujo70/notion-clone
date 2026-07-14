type ObservedOperation = { seq: number }

export type CatchUpObservation = {
  afterSeq: number
  upToSeq: number | null
  latestSeq: number
  operations: ObservedOperation[]
}

declare global {
  interface Window {
    __cypressWorkspaceSockets?: WebSocket[]
    __cypressWorkspaceSocketTracker?: WorkspaceSocketTracker
  }
}
export type SocketTrackingWindow = Window & typeof globalThis
export type WorkspaceSocketTracker = {
  readonly sockets: WebSocket[]
  readonly blockedAttempts: number
  readonly cursor: number
  readonly pageLoads: number
  blockConnections: () => void
  waitForBlockedAttempt: () => Promise<void>
  waitForInitialCatchUp: () => Promise<void>
  waitForCursorAbove: (cursor: number) => Promise<void>
  waitForCatchUpAfter: (cursor: number) => Promise<void>
  catchUpsAfter: (cursor: number) => CatchUpObservation[]
  allowConnections: () => void
  openSockets: () => WebSocket[]
  closeOpenSockets: () => Promise<void>
}
class BlockedWorkspaceSocket extends EventTarget {
  readonly readyState = WebSocket.CLOSED
  onclose: ((event: CloseEvent) => void) | null = null
  constructor() {
    super()
    queueMicrotask(() => {
      const event = new CloseEvent("close")
      this.onclose?.(event)
      this.dispatchEvent(event)
    })
  }
  close() {}
  send() {}
}
/** Observes the real app's delivery inputs; write ACKs cannot advance this cursor. */
export function installWorkspaceSocketTracker(win: SocketTrackingWindow) {
  const NativeWebSocket = (win as unknown as { WebSocket: typeof WebSocket })
    .WebSocket
  const nativeFetch = win.fetch.bind(win)
  const sockets: WebSocket[] = []
  const pending = new Map<number, ObservedOperation>()
  const catchUps: CatchUpObservation[] = []
  let cursor = 0
  let pageLoads = 0
  let connectionsBlocked = false
  let blockedAttempts = 0
  let initialCatchUpComplete = false
  let resolveBlockedAttempt: (() => void) | null = null
  let resolveInitialCatchUp: (() => void) | null = null
  let cursorWaiters: Array<{ cursor: number; resolve: () => void }> = []
  let catchUpWaiters: Array<{ cursor: number; resolve: () => void }> = []
  let blockedAttempt: Promise<void> | null = null
  const initialCatchUp = new Promise<void>((resolve) => {
    resolveInitialCatchUp = resolve
  })
  const drain = () => {
    while (pending.has(cursor + 1)) {
      pending.delete(cursor + 1)
      cursor += 1
    }
    cursorWaiters = cursorWaiters.filter((waiter) => {
      if (cursor > waiter.cursor) {
        waiter.resolve()
        return false
      }
      return true
    })
  }
  const observeOperation = (operation: ObservedOperation) => {
    if (operation.seq <= cursor) return
    pending.set(operation.seq, operation)
    drain()
  }
  const observePageBaseline = (seq: number) => {
    pageLoads += 1
    cursor = seq
    for (const pendingSeq of pending.keys())
      if (pendingSeq <= cursor) pending.delete(pendingSeq)
    drain()
  }
  const observeCatchUp = (observation: CatchUpObservation) => {
    catchUps.push(observation)
    observation.operations.forEach(observeOperation)
    if (!initialCatchUpComplete) {
      initialCatchUpComplete = true
      resolveInitialCatchUp?.()
      resolveInitialCatchUp = null
    }
    catchUpWaiters = catchUpWaiters.filter((waiter) => {
      if (observation.afterSeq === waiter.cursor) {
        waiter.resolve()
        return false
      }
      return true
    })
  }
  function TrackingWebSocket(url: string | URL, protocols?: string | string[]) {
    if (connectionsBlocked) {
      blockedAttempts += 1
      resolveBlockedAttempt?.()
      resolveBlockedAttempt = null
      return new BlockedWorkspaceSocket() as unknown as WebSocket
    }
    const socket =
      protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols)
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string
          event?: ObservedOperation
        }
        if (payload.type === "op" && payload.event)
          observeOperation(payload.event)
      } catch {
        /* production also ignores malformed messages */
      }
    })
    sockets.push(socket)
    return socket
  }
  Object.setPrototypeOf(TrackingWebSocket, NativeWebSocket)
  TrackingWebSocket.prototype = NativeWebSocket.prototype
  win.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init)
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? input.toString(), win.location.href)
    const method = init?.method ?? request?.method ?? "GET"
    if (
      method === "GET" &&
      /\/workspaces\/[^/]+\/pages\/[^/]+$/.test(url.pathname)
    ) {
      const body = (await response.clone().json()) as { seq?: number }
      if (typeof body.seq === "number") observePageBaseline(body.seq)
    }
    if (
      method === "GET" &&
      /\/workspaces\/[^/]+\/operations$/.test(url.pathname)
    ) {
      const body = (await response.clone().json()) as {
        latest_seq: number
        operations: ObservedOperation[]
      }
      observeCatchUp({
        afterSeq: Number(url.searchParams.get("after_seq")),
        upToSeq: url.searchParams.has("up_to_seq")
          ? Number(url.searchParams.get("up_to_seq"))
          : null,
        latestSeq: body.latest_seq,
        operations: body.operations,
      })
    }
    return response
  }) as typeof fetch
  const tracker: WorkspaceSocketTracker = {
    sockets,
    get blockedAttempts() {
      return blockedAttempts
    },
    get cursor() {
      return cursor
    },
    get pageLoads() {
      return pageLoads
    },
    blockConnections() {
      connectionsBlocked = true
      blockedAttempt = new Promise<void>((resolve) => {
        resolveBlockedAttempt = resolve
      })
    },
    waitForBlockedAttempt() {
      return (
        blockedAttempt ??
        Promise.reject(new Error("Connections are not blocked"))
      )
    },
    waitForInitialCatchUp() {
      return initialCatchUpComplete ? Promise.resolve() : initialCatchUp
    },
    waitForCursorAbove(previousCursor) {
      if (cursor > previousCursor) return Promise.resolve()
      return new Promise<void>((resolve) =>
        cursorWaiters.push({ cursor: previousCursor, resolve })
      )
    },
    waitForCatchUpAfter(previousCursor) {
      if (catchUps.some((page) => page.afterSeq === previousCursor))
        return Promise.resolve()
      return new Promise<void>((resolve) =>
        catchUpWaiters.push({ cursor: previousCursor, resolve })
      )
    },
    catchUpsAfter(previousCursor) {
      const first = catchUps.findIndex(
        (page) => page.afterSeq === previousCursor
      )
      return first === -1 ? [] : catchUps.slice(first)
    },
    allowConnections() {
      connectionsBlocked = false
      resolveBlockedAttempt = null
    },
    openSockets() {
      return sockets.filter(
        (socket) => socket.readyState === NativeWebSocket.OPEN
      )
    },
    closeOpenSockets() {
      return Promise.all(
        sockets
          .filter((socket) => socket.readyState === NativeWebSocket.OPEN)
          .map(
            (socket) =>
              new Promise<void>((resolve) => {
                socket.addEventListener("close", () => resolve(), {
                  once: true,
                })
                socket.close()
              })
          )
      ).then(() => undefined)
    },
  }
  Object.defineProperty(win, "WebSocket", {
    configurable: true,
    writable: true,
    value: TrackingWebSocket as unknown as typeof WebSocket,
  })
  win.__cypressWorkspaceSockets = sockets
  win.__cypressWorkspaceSocketTracker = tracker
}
