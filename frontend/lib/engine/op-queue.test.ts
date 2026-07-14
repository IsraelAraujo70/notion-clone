import { describe, expect, it, vi } from "vitest"

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
    await expect(queue.drained()).rejects.toBeInstanceOf(ApiError)

    expect(sent).toEqual(["1"])
    expect(reported).toBeInstanceOf(ApiError)

    // Fila parada: nada mais é enviado até o editor recarregar do servidor.
    queue.push([op("3")])
    await expect(queue.drained()).rejects.toBeInstanceOf(ApiError)
    expect(sent).toEqual(["1"])
  })

  it("debounces a typing burst into one final request", async () => {
    const sent: Operation[] = []
    const discarded: string[] = []
    const queue = createOpQueue({
      send: async (operation) => sent.push(operation),
      onStateChange: () => {},
      onCoalesced: (operation) => discarded.push(operation.opId),
      sleep: noSleep,
    })

    const text = (value: string): Operation => ({
      type: "update_block",
      opId: `op-${value}`,
      blockId: "b1",
      properties: { text: value },
    })

    queue.push([text("h")], "text:b1")
    queue.push([text("he")], "text:b1")
    queue.push([text("hel")], "text:b1")
    queue.push([text("hello")], "text:b1")
    await queue.drained()

    expect(sent.map((operation) => operation.opId)).toEqual(["op-hello"])
    expect(discarded).toEqual(["op-h", "op-he", "op-hel"])
  })

  it("waits for the debounce window before sending", async () => {
    vi.useFakeTimers()
    try {
      const sent: string[] = []
      const queue = createOpQueue({
        send: async (operation) => sent.push(operation.opId),
        onStateChange: () => {},
        sleep: noSleep,
      })
      const text = (value: string): Operation => ({
        type: "update_block",
        opId: `op-${value}`,
        blockId: "b1",
        properties: { text: value },
      })

      queue.push([text("hello")], "text:b1")
      await vi.advanceTimersByTimeAsync(299)
      expect(sent).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      await queue.drained()
      expect(sent).toEqual(["op-hello"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("debounces character deletion like any other text update", async () => {
    const sent: Operation[] = []
    const queue = createOpQueue({
      send: async (operation) => sent.push(operation),
      onStateChange: () => {},
      sleep: noSleep,
    })
    const text = (value: string): Operation => ({
      type: "update_block",
      opId: `op-${value || "empty"}`,
      blockId: "b1",
      properties: { text: value },
    })

    queue.push([text("hello")], "text:b1")
    queue.push([text("hell")], "text:b1")
    queue.push([text("")], "text:b1")
    await queue.drained()

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ properties: { text: "" } })
  })

  it("flushes held text before a structural operation", async () => {
    const sent: string[] = []
    const queue = createOpQueue({
      send: async (operation) => sent.push(operation.opId),
      onStateChange: () => {},
      sleep: noSleep,
    })
    const text: Operation = {
      type: "update_block",
      opId: "text",
      blockId: "b1",
      properties: { text: "final" },
    }

    queue.push([text], "text:b1")
    queue.push([op("delete")])
    await queue.drained()

    expect(sent).toEqual(["text", "delete"])
  })

  it("flush waits for a debounced update pushed while another request is in flight", async () => {
    const sent: string[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const queue = createOpQueue({
      send: async (operation) => {
        sent.push(operation.opId)
        if (operation.opId === "structural") await gate
      },
      onStateChange: () => {},
      sleep: noSleep,
    })
    queue.push([op("structural")])
    const flushing = queue.flush()
    queue.push(
      [
        {
          type: "update_block",
          opId: "text",
          blockId: "b1",
          properties: { text: "latest" },
        },
      ],
      "text:b1"
    )
    release()

    await flushing
    expect(sent).toEqual(["structural", "text"])
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
    await expect(queue.drained()).rejects.toBeInstanceOf(ApiError)
    expect(attempts).toBe(6)
  })

  it("drains an operation pushed as the active drain is settling", async () => {
    const sent: string[] = []
    let queuedSecond = false
    const queue = createOpQueue({
      send: async (operation) => {
        sent.push(operation.opId)
      },
      onStateChange: (state) => {
        if (state === "saved" && !queuedSecond) {
          queuedSecond = true
          queue.push([op("2")])
        }
      },
      sleep: noSleep,
    })

    queue.push([op("1")])
    await queue.drained()

    expect(sent).toEqual(["1", "2"])
  })
})
