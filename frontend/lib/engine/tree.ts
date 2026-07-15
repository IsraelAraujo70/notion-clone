import type {
  Block,
  BlockProperties,
  BlockType,
  JsonValue,
  Operation,
  UpdateBlockOp,
} from "@/lib/contracts"
import { TYPE_PROP_VERSION_KEY } from "@/lib/contracts"
import { createId } from "@/lib/id"

// Engine puro: aplica as operações numa árvore em memória e devolve
// a árvore nova + as ops inversas (base do undo). O servidor reimplementa
// esta mesma semântica; os testes daqui viram o contrato de comportamento.

export interface BlockTree {
  rootId: string
  blocks: ReadonlyMap<string, Block>
}

export class EngineError extends Error {}

export const WORKSPACE_ID = "local"

export function newBlock(
  type: BlockType,
  properties: BlockProperties = {},
  id: string = createId(),
  workspaceId: string = WORKSPACE_ID
): Block {
  return {
    id,
    workspaceId,
    type,
    properties,
    propVersions: {},
    content: [],
    parentId: null,
    trashedAt: null,
    trashedIndex: null,
  }
}

/** LWW: aplica se `opVersion >= stored` (empate vence por ordem de chegada). */
function lwwAccept(
  stored: Record<string, number> | undefined,
  opVersions: Record<string, number> | undefined,
  key: string
): number | null {
  const current = stored?.[key] ?? 0
  const incoming =
    opVersions && key in opVersions ? opVersions[key]! : current + 1
  return incoming < current ? null : incoming
}

/**
 * Preenche `propVersions` em updates que ainda não as carregam, a partir do
 * estado local. Usado pelo editor antes de apply + enqueue.
 */
export function stampPropVersions(tree: BlockTree, op: Operation): Operation {
  if (op.type !== "update_block") return op
  const block = getBlock(tree, op.blockId)
  const propVersions = { ...(op.propVersions ?? {}) }
  if (op.properties) {
    for (const key of Object.keys(op.properties)) {
      if (propVersions[key] === undefined) {
        propVersions[key] = (block.propVersions?.[key] ?? 0) + 1
      }
    }
  }
  if (op.blockType && op.blockType !== block.type) {
    if (propVersions[TYPE_PROP_VERSION_KEY] === undefined) {
      propVersions[TYPE_PROP_VERSION_KEY] =
        (block.propVersions?.[TYPE_PROP_VERSION_KEY] ?? 0) + 1
    }
  }
  return Object.keys(propVersions).length > 0 ? { ...op, propVersions } : op
}

export function createPageTree(
  title: string,
  rootId: string = createId()
): BlockTree {
  const root = newBlock("page", { title }, rootId)
  return { rootId, blocks: new Map([[rootId, root]]) }
}

/** Monta a árvore a partir do que o servidor devolveu em `GET /pages/{id}`. */
export function treeFromBlocks(rootId: string, blocks: Block[]): BlockTree {
  return { rootId, blocks: new Map(blocks.map((block) => [block.id, block])) }
}

export function getBlock(tree: BlockTree, id: string): Block {
  const block = tree.blocks.get(id)
  if (!block) throw new EngineError(`block not found: ${id}`)
  return block
}

/** Filhos na ordem do `content` (que só contém blocos vivos; trashed sai do array). */
export function getChildren(tree: BlockTree, id: string): Block[] {
  return getBlock(tree, id).content.map((childId) => getBlock(tree, childId))
}

function isDescendant(
  tree: BlockTree,
  ancestorId: string,
  id: string
): boolean {
  const seen = new Set<string>()
  let current = tree.blocks.get(id)
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true
    seen.add(current.id)
    current = tree.blocks.get(current.parentId)
  }
  return false
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

function mutate(tree: BlockTree, ...blocks: Block[]): BlockTree {
  const next = new Map(tree.blocks)
  for (const block of blocks) next.set(block.id, block)
  return { rootId: tree.rootId, blocks: next }
}

export interface ApplyResult {
  tree: BlockTree
  /** Ops que desfazem esta op, na ordem em que devem ser aplicadas. */
  inverse: Operation[]
}

export function applyOperation(
  tree: BlockTree,
  op: Operation,
  now: () => string = () => new Date().toISOString()
): ApplyResult {
  switch (op.type) {
    case "insert_block": {
      if (tree.blocks.has(op.block.id))
        throw new EngineError(`duplicate block id: ${op.block.id}`)
      // ponytail: insert é sempre de bloco folha; subárvores entram como uma op por bloco.
      if (op.block.content.length > 0)
        throw new EngineError("insert_block requires empty content")
      const parent = getBlock(tree, op.parentId)
      if (parent.trashedAt)
        throw new EngineError("cannot insert into trashed block")
      const index = clampIndex(op.index, parent.content.length)
      const content = [...parent.content]
      content.splice(index, 0, op.block.id)
      const inserted: Block = {
        ...op.block,
        parentId: op.parentId,
        trashedAt: null,
        trashedIndex: null,
      }
      return {
        tree: mutate(tree, inserted, { ...parent, content }),
        // Undo de insert é delete (soft): o bloco sai do content e vai para o trash.
        // Redo é restore. Mantém o contrato em 5 ops, sem segundo caminho de escrita.
        inverse: [
          {
            type: "delete_block",
            opId: createId(),
            blockId: op.block.id,
          },
        ],
      }
    }

    case "update_block": {
      const block = getBlock(tree, op.blockId)
      if (block.trashedAt) throw new EngineError("cannot update trashed block")
      const inverse: UpdateBlockOp = {
        type: "update_block",
        opId: createId(),
        blockId: op.blockId,
      }
      const updated: Block = {
        ...block,
        properties: { ...block.properties },
        propVersions: { ...(block.propVersions ?? {}) },
      }
      // Inversa sem propVersions: no apply vira stored+1 e sempre vence (undo
      // de uma sequência de updates não pode ser engolido pelo LWW).
      if (op.blockType && op.blockType !== block.type) {
        const version = lwwAccept(
          block.propVersions,
          op.propVersions,
          TYPE_PROP_VERSION_KEY
        )
        if (version !== null) {
          inverse.blockType = block.type
          updated.type = op.blockType
          updated.propVersions![TYPE_PROP_VERSION_KEY] = version
        }
      }
      if (op.properties) {
        inverse.properties = {}
        for (const [key, value] of Object.entries(op.properties)) {
          const version = lwwAccept(block.propVersions, op.propVersions, key)
          if (version === null) continue
          inverse.properties[key] =
            key in block.properties
              ? (block.properties[key] as JsonValue)
              : null
          if (value === null) delete updated.properties[key]
          else updated.properties[key] = value
          updated.propVersions![key] = version
        }
        if (Object.keys(inverse.properties).length === 0) {
          delete inverse.properties
        }
      }
      return { tree: mutate(tree, updated), inverse: [inverse] }
    }

    case "move_block": {
      const block = getBlock(tree, op.blockId)
      if (block.trashedAt) throw new EngineError("cannot move trashed block")
      if (!block.parentId) throw new EngineError("cannot move the root block")
      if (op.blockId === op.newParentId)
        throw new EngineError("cannot move block into itself")
      if (isDescendant(tree, op.blockId, op.newParentId))
        throw new EngineError("move would create a cycle")
      const newParent = getBlock(tree, op.newParentId)
      if (newParent.trashedAt)
        throw new EngineError("cannot move into trashed block")

      const oldParent = getBlock(tree, block.parentId)
      const oldIndex = oldParent.content.indexOf(op.blockId)
      if (oldIndex === -1)
        throw new EngineError(`content/parentId mismatch for ${op.blockId}`)

      const oldContent = [...oldParent.content]
      oldContent.splice(oldIndex, 1)
      const sameParent = oldParent.id === newParent.id
      const newContent = sameParent ? oldContent : [...newParent.content]
      const index = clampIndex(op.index, newContent.length)
      newContent.splice(index, 0, op.blockId)

      const moved: Block = { ...block, parentId: op.newParentId }
      const changed = sameParent
        ? [moved, { ...oldParent, content: newContent }]
        : [
            moved,
            { ...oldParent, content: oldContent },
            { ...newParent, content: newContent },
          ]
      return {
        tree: mutate(tree, ...changed),
        inverse: [
          {
            type: "move_block",
            opId: createId(),
            blockId: op.blockId,
            newParentId: oldParent.id,
            index: oldIndex,
          },
        ],
      }
    }

    case "delete_block": {
      const block = getBlock(tree, op.blockId)
      if (block.trashedAt) throw new EngineError("block already trashed")
      if (!block.parentId) throw new EngineError("cannot trash the root block")
      // Soft delete só na raiz da subárvore: descendentes ficam intactos e voltam
      // juntos no restore. O bloco SAI do content do pai (nada de slots fantasmas
      // bagunçando índices) e trashedIndex guarda a posição para o restore.
      const parent = getBlock(tree, block.parentId)
      const index = parent.content.indexOf(op.blockId)
      if (index === -1)
        throw new EngineError(`content/parentId mismatch for ${op.blockId}`)
      const content = [...parent.content]
      content.splice(index, 1)
      return {
        tree: mutate(
          tree,
          { ...block, trashedAt: now(), trashedIndex: index },
          { ...parent, content }
        ),
        inverse: [
          {
            type: "restore_block",
            opId: createId(),
            blockId: op.blockId,
          },
        ],
      }
    }

    case "restore_block": {
      const block = getBlock(tree, op.blockId)
      if (!block.trashedAt || block.parentId === null)
        throw new EngineError("block is not trashed")
      // O pai pode estar trashed (deletado depois do filho): o restore ainda vale,
      // o bloco só fica visível quando o ancestral voltar.
      const parent = getBlock(tree, block.parentId)
      const index = clampIndex(
        block.trashedIndex ?? parent.content.length,
        parent.content.length
      )
      const content = [...parent.content]
      content.splice(index, 0, op.blockId)
      return {
        tree: mutate(
          tree,
          { ...block, trashedAt: null, trashedIndex: null },
          { ...parent, content }
        ),
        inverse: [
          {
            type: "delete_block",
            opId: createId(),
            blockId: op.blockId,
          },
        ],
      }
    }

    case "transfer_subtree_out": {
      const block = getBlock(tree, op.blockId)
      if (!block.parentId)
        throw new EngineError("cannot transfer the root block")
      const parent = getBlock(tree, block.parentId)
      const index = parent.content.indexOf(op.blockId)
      if (index === -1)
        throw new EngineError(`content/parentId mismatch for ${op.blockId}`)

      const removed = new Set<string>([op.blockId])
      for (const candidate of tree.blocks.values()) {
        if (isDescendant(tree, op.blockId, candidate.id))
          removed.add(candidate.id)
      }
      const blocks = new Map(tree.blocks)
      for (const id of removed) blocks.delete(id)
      const content = [...parent.content]
      content.splice(index, 1)
      blocks.set(parent.id, { ...parent, content })
      return { tree: { ...tree, blocks }, inverse: [] }
    }

    case "transfer_subtree_in": {
      const parent = getBlock(tree, op.parentId)
      if (parent.trashedAt)
        throw new EngineError("cannot transfer into trashed block")
      if (op.blocks.length === 0)
        throw new EngineError("transfer requires a non-empty subtree")
      const incoming = new Map(op.blocks.map((block) => [block.id, block]))
      const roots = op.blocks.filter(
        (block) => !incoming.has(block.parentId ?? "")
      )
      if (roots.length !== 1)
        throw new EngineError("transfer requires exactly one subtree root")
      for (const block of op.blocks) {
        if (tree.blocks.has(block.id))
          throw new EngineError(`duplicate block id: ${block.id}`)
        for (const childId of block.content) {
          const child = incoming.get(childId)
          if (!child || child.parentId !== block.id)
            throw new EngineError(`invalid transferred subtree: ${childId}`)
        }
      }
      const root = roots[0]!
      const blocks = new Map(tree.blocks)
      for (const block of op.blocks)
        blocks.set(block.id, { ...block, workspaceId: parent.workspaceId })
      blocks.set(root.id, {
        ...root,
        workspaceId: parent.workspaceId,
        parentId: op.parentId,
      })
      const content = [...parent.content]
      content.splice(clampIndex(op.index, content.length), 0, root.id)
      blocks.set(parent.id, { ...parent, content })
      return { tree: { ...tree, blocks }, inverse: [] }
    }
  }
}

/** Aplica uma sequência, acumulando as inversas já na ordem de desfazer. */
export function applyAll(tree: BlockTree, ops: Operation[]): ApplyResult {
  const inverse: Operation[] = []
  for (const op of ops) {
    const result = applyOperation(tree, op)
    tree = result.tree
    inverse.unshift(...result.inverse)
  }
  return { tree, inverse }
}

export interface VisibleNode {
  type: BlockType
  properties: BlockProperties
  children: VisibleNode[]
}

/** Projeção visível (sem trashed, sem ids) — é o que "igualdade exata" compara. */
export function visibleTree(
  tree: BlockTree,
  id: string = tree.rootId
): VisibleNode {
  const block = getBlock(tree, id)
  return {
    type: block.type,
    properties: block.properties,
    children: getChildren(tree, id).map((child) => visibleTree(tree, child.id)),
  }
}

/** Invariantes estruturais; usado pelos testes após cada operação. */
export function checkInvariants(tree: BlockTree): void {
  const root = getBlock(tree, tree.rootId)
  if (root.parentId !== null)
    throw new EngineError("root must have null parentId")
  for (const block of tree.blocks.values()) {
    for (const childId of block.content) {
      const child = getBlock(tree, childId)
      if (child.parentId !== block.id)
        throw new EngineError(
          `content/parentId mismatch: ${childId} in ${block.id}`
        )
      if (child.trashedAt !== null)
        throw new EngineError(
          `trashed block ${childId} still in content of ${block.id}`
        )
    }
    if (block.id !== tree.rootId) {
      if (!block.parentId) throw new EngineError(`orphan block: ${block.id}`)
      const parent = getBlock(tree, block.parentId)
      const inParent = parent.content.includes(block.id)
      if (block.trashedAt === null && !inParent)
        throw new EngineError(`block ${block.id} missing from parent content`)
      if (block.trashedAt !== null && inParent)
        throw new EngineError(
          `trashed block ${block.id} still in parent content`
        )
      if (isDescendant(tree, block.id, block.id))
        throw new EngineError(`cycle at ${block.id}`)
    }
  }
}
