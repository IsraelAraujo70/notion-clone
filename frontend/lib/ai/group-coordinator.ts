import type { OperationGroupMetadata } from "@/lib/contracts"

type GroupOp = {
  opId: string
  seq: number
}

type Group = {
  ops: Map<string, GroupOp>
  completed: boolean
  lastSeq?: number
}

export type ReadyOperationGroup = {
  groupId: string
}

export class OperationGroupCoordinator {
  private groups = new Map<string, Group>()
  private finalized = new Set<string>()

  add(metadata: OperationGroupMetadata, opId: string, seq: number): boolean {
    if (this.finalized.has(metadata.group_id)) return false
    const group = this.groups.get(metadata.group_id) ?? {
      ops: new Map<string, GroupOp>(),
      completed: false,
    }
    if (group.ops.has(opId)) return false
    group.ops.set(opId, { opId, seq })
    this.groups.set(metadata.group_id, group)
    return true
  }

  complete(groupId: string, lastSeq: number) {
    if (this.finalized.has(groupId)) return
    const group = this.groups.get(groupId) ?? {
      ops: new Map<string, GroupOp>(),
      completed: false,
    }
    group.completed = true
    group.lastSeq = lastSeq
    this.groups.set(groupId, group)
  }

  takeReady(cursor: number): ReadyOperationGroup[] {
    const ready: ReadyOperationGroup[] = []
    for (const [groupId, group] of this.groups) {
      if (
        !group.completed ||
        group.lastSeq === undefined ||
        cursor < group.lastSeq
      ) {
        continue
      }
      ready.push({ groupId })
      this.groups.delete(groupId)
      this.finalized.add(groupId)
    }
    return ready
  }

  reset() {
    this.groups.clear()
    this.finalized.clear()
  }
}
