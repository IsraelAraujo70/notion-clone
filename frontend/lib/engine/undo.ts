import type { Operation } from "@/lib/contracts"
import { applyAll, type BlockTree } from "./tree"

// Undo por ops inversas. O editor registra a inversa de cada op aplicada;
// undo aplica a inversa e empilha a inversa-da-inversa como redo.
// Coalescing: updates consecutivos com a mesma chave (ex.: digitação no mesmo
// bloco) viram um único passo de undo — a entrada mais antiga guarda o estado
// pré-rajada, então basta descartar as inversas seguintes da mesma chave.

interface UndoEntry {
  inverse: Operation[]
  coalesceKey?: string
  open?: boolean
}

/** `ops` são as operações efetivamente aplicadas — o editor as envia ao servidor. */
export interface UndoResult {
  tree: BlockTree
  ops: Operation[]
}

export class UndoManager {
  private undoStack: UndoEntry[] = []
  private redoStack: Operation[][] = []
  private openGroups = new Map<string, UndoEntry>()

  record(inverse: Operation[], coalesceKey?: string): void {
    this.redoStack = []
    if (coalesceKey && this.undoStack.at(-1)?.coalesceKey === coalesceKey)
      return
    this.undoStack.push({ inverse, coalesceKey })
  }

  recordOpenGroup(groupKey: string, inverse: Operation[]): void {
    this.redoStack = []
    const existing = this.openGroups.get(groupKey)
    if (existing) {
      existing.inverse.unshift(...inverse)
      return
    }
    const entry = { inverse: [...inverse], open: true }
    this.openGroups.set(groupKey, entry)
    this.undoStack.push(entry)
  }

  closeGroup(groupKey: string): void {
    const entry = this.openGroups.get(groupKey)
    if (!entry) return
    entry.open = false
    this.openGroups.delete(groupKey)
  }

  /** Fecha o grupo de coalescing atual (chamar em blur, Enter, ops estruturais…). */
  breakCoalescing(): void {
    const top = this.undoStack.at(-1)
    if (top) top.coalesceKey = undefined
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.undoStack.at(-1)?.open
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(tree: BlockTree): UndoResult {
    if (this.undoStack.at(-1)?.open) return { tree, ops: [] }
    const entry = this.undoStack.pop()
    if (!entry) return { tree, ops: [] }
    const { tree: next, inverse } = applyAll(tree, entry.inverse)
    this.redoStack.push(inverse)
    return { tree: next, ops: entry.inverse }
  }

  redo(tree: BlockTree): UndoResult {
    const ops = this.redoStack.pop()
    if (!ops) return { tree, ops: [] }
    const { tree: next, inverse } = applyAll(tree, ops)
    this.undoStack.push({ inverse })
    return { tree: next, ops }
  }
}
