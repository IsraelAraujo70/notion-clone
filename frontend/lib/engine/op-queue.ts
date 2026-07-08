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
  /** Resolve quando a fila esvazia (ou falha). Para testes e teardown. */
  drained: () => Promise<void>
}

export function createOpQueue(options: {
  send: (op: Operation) => Promise<unknown>
  onStateChange: (state: SaveState, error?: unknown) => void
  sleep?: (ms: number) => Promise<void>
}): OpQueue {
  const { send, onStateChange, sleep = realSleep } = options
  const pending: Entry[] = []
  let running: Promise<void> | null = null
  let stopped = false

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
    onStateChange("saving")
    while (pending.length > 0) {
      try {
        await sendWithRetry(pending[0].op)
      } catch (error) {
        stopped = true
        pending.length = 0
        onStateChange("error", error)
        return
      }
      pending.shift()
    }
    onStateChange("saved")
  }

  return {
    push(ops, coalesceKey) {
      if (stopped || ops.length === 0) return
      // `pending[0]` pode estar em voo: nunca é substituída.
      const last = pending.length > 1 ? pending[pending.length - 1] : undefined
      if (
        coalesceKey &&
        ops.length === 1 &&
        last &&
        last.coalesceKey === coalesceKey
      ) {
        last.op = ops[0]
        return
      }
      pending.push(
        ...ops.map((op, index) => ({
          op,
          // Só a última op do lote pode absorver a próxima da mesma chave.
          coalesceKey: index === ops.length - 1 ? coalesceKey : undefined,
        }))
      )
      if (running) return
      running = drain().finally(() => {
        running = null
      })
    },
    async drained() {
      while (running) await running
    },
  }
}
