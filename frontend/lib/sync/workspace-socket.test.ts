import { beforeEach, describe, expect, it, vi } from "vitest"

import { api, type LoggedOperation } from "@/lib/api"
import {
  catchUpOperations,
  RemoteOperationBuffer,
  type AppliedOpEvent,
} from "@/lib/sync/workspace-socket"

vi.mock("@/lib/api", () => ({
  api: {
    listOperations: vi.fn(),
  },
}))

function operation(seq: number): LoggedOperation {
  return {
    seq,
    op_id: `op-${seq}`,
    actor_id: "actor-1",
    operation: {
      type: "update_block",
      opId: `op-${seq}`,
      blockId: "block-1",
      properties: { text: `value-${seq}` },
      propVersions: { text: seq },
    },
  }
}

function event(seq: number): AppliedOpEvent {
  const logged = operation(seq)
  return {
    workspace_id: "workspace-1",
    seq,
    op_id: logged.op_id,
    actor_id: logged.actor_id,
    operation: logged.operation,
  }
}

describe("catchUpOperations", () => {
  beforeEach(() => {
    vi.mocked(api.listOperations).mockReset()
  })

  it("fetches every page when more than 500 operations were missed", async () => {
    vi.mocked(api.listOperations)
      .mockResolvedValueOnce({
        operations: Array.from({ length: 500 }, (_, index) =>
          operation(index + 1)
        ),
        latest_seq: 501,
      })
      .mockResolvedValueOnce({
        operations: [operation(501)],
        latest_seq: 501,
      })

    const result = await catchUpOperations("token", "workspace-1", 0)

    expect(result.operations.map(({ seq }) => seq)).toEqual(
      Array.from({ length: 501 }, (_, index) => index + 1)
    )
    expect(result.latestSeq).toBe(501)
    expect(api.listOperations).toHaveBeenNthCalledWith(
      1,
      "token",
      "workspace-1",
      0,
      500,
      undefined
    )
    expect(api.listOperations).toHaveBeenNthCalledWith(
      2,
      "token",
      "workspace-1",
      500,
      500,
      501
    )
  })

  it("returns after one request when the client is already current", async () => {
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [],
      latest_seq: 42,
    })

    await expect(
      catchUpOperations("token", "workspace-1", 42)
    ).resolves.toEqual({ operations: [], latestSeq: 42 })
    expect(api.listOperations).toHaveBeenCalledTimes(1)
  })

  it("fails instead of looping when a page makes no progress", async () => {
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [],
      latest_seq: 43,
    })

    await expect(catchUpOperations("token", "workspace-1", 42)).rejects.toThrow(
      "Catch-up made no progress at seq 42 toward 43"
    )
    expect(api.listOperations).toHaveBeenCalledTimes(1)
  })

  it("fails on a non-contiguous operation page", async () => {
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [operation(44)],
      latest_seq: 44,
    })

    await expect(catchUpOperations("token", "workspace-1", 42)).rejects.toThrow(
      "Catch-up gap after seq 42: received 44"
    )
  })
})

describe("RemoteOperationBuffer", () => {
  it("holds out-of-order WebSocket events until the sequence is contiguous", () => {
    const buffer = new RemoteOperationBuffer(500)
    const applied: number[] = []

    buffer.enqueue(event(503))
    buffer.enqueue(event(501))
    buffer.enqueue(event(502))
    buffer.drain(({ seq }) => applied.push(seq))

    expect(applied).toEqual([501, 502, 503])
    expect(buffer.cursor).toBe(503)
    expect(buffer.hasGap()).toBe(false)
  })

  it("keeps events newer than a page snapshot and drops older duplicates", () => {
    const buffer = new RemoteOperationBuffer()
    const applied: number[] = []

    buffer.enqueue(event(10))
    buffer.enqueue(event(11))
    buffer.setBaseline(10)
    buffer.drain(({ seq }) => applied.push(seq))

    expect(applied).toEqual([11])
    expect(buffer.cursor).toBe(11)
  })

  it("does not advance across a live sequence gap", () => {
    const buffer = new RemoteOperationBuffer(500)
    const applied: number[] = []

    buffer.enqueue(event(502))
    buffer.drain(({ seq }) => applied.push(seq))

    expect(applied).toEqual([])
    expect(buffer.cursor).toBe(500)
    expect(buffer.hasGap()).toBe(true)
  })
})
