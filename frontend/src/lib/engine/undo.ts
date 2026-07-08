import type { Operation } from "@notion-clone/contracts";
import { applyAll, type BlockTree } from "./tree";

// Undo por ops inversas. O editor registra a inversa de cada op aplicada;
// undo aplica a inversa e empilha a inversa-da-inversa como redo.
// Coalescing: updates consecutivos com a mesma chave (ex.: digitação no mesmo
// bloco) viram um único passo de undo — a entrada mais antiga guarda o estado
// pré-rajada, então basta descartar as inversas seguintes da mesma chave.

interface UndoEntry {
  inverse: Operation[];
  coalesceKey?: string;
}

export class UndoManager {
  private undoStack: UndoEntry[] = [];
  private redoStack: Operation[][] = [];

  record(inverse: Operation[], coalesceKey?: string): void {
    this.redoStack = [];
    if (coalesceKey && this.undoStack.at(-1)?.coalesceKey === coalesceKey) return;
    this.undoStack.push({ inverse, coalesceKey });
  }

  /** Fecha o grupo de coalescing atual (chamar em blur, Enter, ops estruturais…). */
  breakCoalescing(): void {
    const top = this.undoStack.at(-1);
    if (top) top.coalesceKey = undefined;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(tree: BlockTree): BlockTree {
    const entry = this.undoStack.pop();
    if (!entry) return tree;
    const { tree: next, inverse } = applyAll(tree, entry.inverse);
    this.redoStack.push(inverse);
    return next;
  }

  redo(tree: BlockTree): BlockTree {
    const ops = this.redoStack.pop();
    if (!ops) return tree;
    const { tree: next, inverse } = applyAll(tree, ops);
    this.undoStack.push({ inverse });
    return next;
  }
}
