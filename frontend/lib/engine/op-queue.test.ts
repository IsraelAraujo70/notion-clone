import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"
import type { Operation } from "@/lib/contracts"
import { createOpQueue, type SaveState } from "./op-queue"

const noSleep = () => Promise.resolve()

function op(id: string): Operation {
  return { type: "delete_block", opId: id, blockId: `block-${id}` }
}

describe("createOpQueue", () => {
  it("sends operations one at a time, in order", async () => {
    const inFlight: string[] = []
    const sent: string[] = []
    const states: SaveState[] = []
    const queue = createOpQueue({
      send: async (operation) => {
        inFlight.push(operation.opId)
        expect(inFlight).toHaveLength(1)
        await Promise.resolve()
        sent.push(operation.opId)
        inFlight.pop()
      },
      onStateChange: (state) => states.push(state),
      sleep: noSleep,
    })

    queue.push([op("1"), op("2")])
    queue.push([op("3")])
    await queue.drained()

    expect(sent).toEqual(["1", "2", "3"])
    expect(states.at(0)).toBe("saving")
    expect(states.at(-1)).toBe("saved")
  })

  it("retries transient failures with backoff and keeps order", async () => {
    let attempts = 0
    const delays: number[] = []
    const queue = createOpQueue({
      send: async () => {
        attempts += 1
        if (attempts < 3) throw new ApiError(503, "unavailable", "nope")
      },
      onStateChange: () => {},
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
    })

    queue.push([op("1")])
    await queue.drained()

    expect(attempts).toBe(3)
    expect(delays).toEqual([250, 500])
  })

  it("retries network errors that are not ApiError", async () => {
    let attempts = 0
    const queue = createOpQueue({
      send: async () => {
        attempts += 1
        if (attempts < 2) throw new TypeError("Failed to fetch")
      },
      onStateChange: () => {},
      sleep: noSleep,
    })

    queue.push([op("1")])
    await queue.drained()
    expect(attempts).toBe(2)
  })

  it("stops the queue on a validation or permission error", async () => {
    const sent: string[] = []
    let reported: unknown = null
    const queue = createOpQueue({
      send: async (operation) => {
        sent.push(operation.opId)
        throw new ApiError(403, "forbidden", "read only")
      },
      onStateChange: (state, error) => {
        if (state === "error") reported = error
      },
      sleep: noSleep,
    })

    queue.push([op("1"), op("2")])
    await queue.drained()

    expect(sent).toEqual(["1"])
    expect(reported).toBeInstanceOf(ApiError)

    // Fila parada: nada mais é enviado até o editor recarregar do servidor.
    queue.push([op("3")])
    await queue.drained()
    expect(sent).toEqual(["1"])
  })

  it("coalesces a typing burst into the last pending op, never the in-flight one", async () => {
    const sent: Operation[] = []
    let release: () => void = () => {}
    const firstInFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    const queue = createOpQueue({
      send: async (operation) => {
        if (sent.length === 0) await firstInFlight
        sent.push(operation)
      },
      onStateChange: () => {},
      sleep: noSleep,
    })

    const text = (value: string): Operation => ({
      type: "update_block",
      opId: `op-${value}`,
      blockId: "b1",
      properties: { text: value },
    })

    queue.push([text("h")], "text:b1") // vai para o voo imediatamente
    queue.push([text("he")], "text:b1")
    queue.push([text("hel")], "text:b1")
    queue.push([text("hello")], "text:b1")
    release()
    await queue.drained()

    // Duas requisições: a que já estava em voo e a última do burst.
    expect(sent.map((operation) => operation.opId)).toEqual(["op-h", "op-hello"])
  })

  it("never coalesces across different keys or structural ops", async () => {
    const sent: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const queue = createOpQueue({
      send: async (operation) => {
        if (sent.length === 0) await gate
        sent.push(operation.opId)
      },
      onStateChange: () => {},
      sleep: noSleep,
    })

    queue.push([op("in-flight")])
    queue.push([op("structural")])
    queue.push([op("typing")], "text:b1")
    queue.push([op("other-key")], "text:b2")
    release()
    await queue.drained()

    expect(sent).toEqual(["in-flight", "structural", "typing", "other-key"])
  })

  it("gives up after the attempt cap so a dead server does not spin forever", async () => {
    let attempts = 0
    const queue = createOpQueue({
      send: async () => {
        attempts += 1
        throw new ApiError(500, "internal_error", "boom")
      },
      onStateChange: () => {},
      sleep: noSleep,
    })

    queue.push([op("1")])
    await queue.drained()
    expect(attempts).toBe(6)
  })
})
