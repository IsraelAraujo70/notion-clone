import { describe, expect, it } from "vitest"

import { OperationGroupCoordinator } from "./group-coordinator"

describe("OperationGroupCoordinator", () => {
  const metadata = (ordinal: number) => ({
    group_id: "group-1",
    group_ordinal: ordinal,
    source: "ai",
    initiated_by: "user-1",
  })

  it("deduplicates delivery and reverses inverses by canonical sequence", () => {
    const coordinator = new OperationGroupCoordinator()
    expect(coordinator.add(metadata(0), "op-b", 11)).toBe(true)
    expect(coordinator.add(metadata(0), "op-a", 10)).toBe(true)
    expect(coordinator.add(metadata(0), "op-a", 10)).toBe(false)
    coordinator.complete("group-1", 11)

    expect(coordinator.takeReady(10)).toEqual([])
    expect(coordinator.takeReady(11)).toEqual([{ groupId: "group-1" }])
    expect(coordinator.takeReady(11)).toEqual([])
  })

  it("never finalizes without the canonical completion boundary", () => {
    const coordinator = new OperationGroupCoordinator()
    coordinator.add(metadata(0), "op-a", 4)
    expect(coordinator.takeReady(100)).toEqual([])
  })

  it("handles completion arriving before the websocket operation", () => {
    const coordinator = new OperationGroupCoordinator()
    coordinator.complete("group-1", 9)
    expect(coordinator.takeReady(8)).toEqual([])
    coordinator.add(metadata(0), "op-a", 9)
    expect(coordinator.takeReady(9)).toHaveLength(1)
  })

  it("finalizes a group with no operations applicable to the loaded page", () => {
    const coordinator = new OperationGroupCoordinator()
    coordinator.complete("group-1", 9)
    expect(coordinator.takeReady(9)).toEqual([{ groupId: "group-1" }])
  })

  it("waits for the last sequence across multiple tool rounds", () => {
    const coordinator = new OperationGroupCoordinator()
    coordinator.add(metadata(0), "round-1", 20)
    coordinator.complete("group-1", 23)
    coordinator.add(metadata(0), "round-2", 23)

    expect(coordinator.takeReady(22)).toEqual([])
    expect(coordinator.takeReady(23)).toEqual([{ groupId: "group-1" }])
  })
})
