import type { Operation } from "@/lib/contracts"
import { ApiError } from "@/lib/api"

// Fila sequencial de operações. O editor aplica localmente e empurra aqui; a
// ordem de envio é a ordem de aplicação, porque uma `move` depois de uma
// `insert` só faz sentido nessa sequência. Falha transitória (rede, 5xx) é
// retentada com backoff; falha de validação/permissão para a fila e o editor
// recarrega o estado do servidor.

export type SaveState = "saved" | "saving" | "error"

const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4000
const MAX_ATTEMPTS = 6
export const OP_DEBOUNCE_MS = 300

function isTransient(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

interface Entry {
  op: Operation
  coalesceKey?: string
}

export interface OpQueue {
  /**
   * `coalesceKey` só vale para um lote de uma op idempotente por reescrita
   * (digitação): a op pendente mais recente com a mesma chave é substituída,
   * então uma rajada vira uma requisição por round-trip em vez de por tecla.
   */
  push: (ops: Operation[], coalesceKey?: string) => void
  /** Libera a edição retida e resolve quando tudo foi confirmado. */
  flush: () => Promise<void>
  /** Mesmo contrato de flush; mantido para consumidores que só aguardam a fila. */
  drained: () => Promise<void>
}

export function createOpQueue(options: {
  send: (op: Operation) => Promise<unknown>
  onStateChange: (state: SaveState, error?: unknown) => void
  onCoalesced?: (operation: Operation) => void
  debounceMs?: number
  sleep?: (ms: number) => Promise<void>
}): OpQueue {
  const {
    send,
    onStateChange,
    onCoalesced,
    debounceMs = OP_DEBOUNCE_MS,
    sleep = realSleep,
  } = options
  const pending: Entry[] = []
  let held: Entry | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let stopped = false
  let failure: unknown

  async function sendWithRetry(op: Operation) {
    let delay = BASE_DELAY_MS
    for (let attempt = 1; ; attempt += 1) {
      try {
        await send(op)
        return
      } catch (error) {
        if (!isTransient(error) || attempt >= MAX_ATTEMPTS) throw error
        await sleep(delay)
        delay = Math.min(delay * 2, MAX_DELAY_MS)
      }
    }
  }

  async function drain() {
    while (pending.length > 0) {
      try {
        await sendWithRetry(pending[0].op)
      } catch (error) {
        stopped = true
        failure = error
        pending.length = 0
        if (held) onCoalesced?.(held.op)
        held = null
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = null
        onStateChange("error", error)
        return
      }
      pending.shift()
    }
    if (!held) onStateChange("saved")
  }

  function ensureRunning() {
    if (running || stopped || pending.length === 0) return
    running = drain().finally(() => {
      running = null
      // Uma op pode entrar depois do último `pending.shift()` e antes deste
      // finally. Inicie outro drain para não deixá-la presa na fila.
      ensureRunning()
    })
  }

  function releaseHeld() {
    if (!held) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    pending.push(held)
    held = null
  }

  function scheduleHeld() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      releaseHeld()
      ensureRunning()
    }, debounceMs)
  }

  async function flush() {
    for (;;) {
      releaseHeld()
      ensureRunning()
      if (running) await running
      if (!running && pending.length === 0 && !held) break
    }
    if (failure) throw failure
  }

  return {
    push(ops, coalesceKey) {
      if (stopped || ops.length === 0) return
      onStateChange("saving")
      const debounceEligible =
        Boolean(coalesceKey) &&
        ops.length === 1 &&
        ops[0].type === "update_block"
      if (debounceEligible) {
        const replaced = held
        if (replaced && replaced.coalesceKey === coalesceKey) {
          onCoalesced?.(replaced.op)
        }
        else {
          releaseHeld()
          ensureRunning()
        }
        held = { op: ops[0], coalesceKey }
        scheduleHeld()
        return
      }
      releaseHeld()
      pending.push(
        ...ops.map((op, index) => ({
          op,
          // Só a última op do lote pode absorver a próxima da mesma chave.
          coalesceKey: index === ops.length - 1 ? coalesceKey : undefined,
        }))
      )
      ensureRunning()
    },
    flush,
    drained: flush,
  }
}
