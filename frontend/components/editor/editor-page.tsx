"use client"

import type { Operation } from "@/lib/contracts"
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { useRouter } from "next/navigation"

import { BlockEditor } from "@/components/editor/BlockEditor"
import { EmojiPicker } from "@/components/pages/emoji-picker"
import { pagePath, usePages } from "@/components/pages/page-provider"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  api,
  type Breadcrumb as Crumb,
  type OperationAck,
  type PageEditor,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  applyOperation,
  getBlock,
  stampPropVersions,
  treeFromBlocks,
  type BlockTree,
} from "@/lib/engine/tree"
import { createOpQueue, type OpQueue, type SaveState } from "@/lib/engine/op-queue"
import { UndoManager } from "@/lib/engine/undo"
import { createId } from "@/lib/id"
import { useWorkspacePresence } from "@/lib/sync/use-presence"
import {
  catchUpOperations,
  type AppliedOpEvent,
} from "@/lib/sync/workspace-socket"
import { PresenceAvatarStack } from "@/components/editor/presence-avatars"

function opId() {
  return createId()
}

function pageProperty(tree: BlockTree, key: "title" | "icon") {
  const value = getBlock(tree, tree.rootId).properties[key]
  return typeof value === "string" ? value : ""
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Salvo",
  saving: "Salvando…",
  error: "Não foi possível salvar",
}

function rememberLocalOp(localOpIds: Set<string>, op: Operation) {
  localOpIds.add(op.opId)
  // Evita crescimento ilimitado em sessões longas.
  if (localOpIds.size > 500) {
    const first = localOpIds.values().next().value
    if (first) localOpIds.delete(first)
  }
}

function touchesSidebar(op: Operation, tree: BlockTree | null): boolean {
  if (op.type === "insert_block") return op.block.type === "page"
  if (
    op.type === "delete_block" ||
    op.type === "restore_block" ||
    op.type === "move_block"
  ) {
    const block = tree?.blocks.get(op.blockId)
    return !block || block.type === "page"
  }
  if (op.type === "update_block") {
    const block = tree?.blocks.get(op.blockId)
    if (block?.type !== "page") return false
    return (
      op.properties?.title !== undefined || op.properties?.icon !== undefined
    )
  }
  return false
}

export function EditorPage({ pageId }: { pageId: string }) {
  const router = useRouter()
  const { token } = useAuth()
  const { activeWorkspaceId } = useWorkspace()
  const { canWrite, refreshPages, pageRevision } = usePages()

  const [tree, setTree] = useState<BlockTree | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([])
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [loadError, setLoadError] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [recentEditors, setRecentEditors] = useState<PageEditor[]>([])
  const undoRef = useRef(new UndoManager())
  const queueRef = useRef<OpQueue | null>(null)
  // Espelho do estado: as mutações do editor têm efeitos colaterais (undo stack,
  // fila de envio) e não podem morar dentro de um updater do setState.
  const treeRef = useRef<BlockTree | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const sidebarDirty = useRef(false)
  const lastSeqRef = useRef(0)
  const localOpIdsRef = useRef(new Set<string>())
  const catchingUpRef = useRef(false)

  const commit = useCallback((next: BlockTree | null) => {
    treeRef.current = next
    setTree(next)
  }, [])

  // Ref estável: effects de load/WS não re-disparam quando refreshPages muda.
  const applyRemoteEventRef = useRef<(event: AppliedOpEvent) => void>(() => {})
  applyRemoteEventRef.current = (event: AppliedOpEvent) => {
    if (localOpIdsRef.current.has(event.op_id)) {
      lastSeqRef.current = Math.max(lastSeqRef.current, event.seq)
      return
    }
    const current = treeRef.current
    if (!current) return
    let next = current
    let applied = false
    try {
      next = applyOperation(current, event.operation).tree
      applied = true
    } catch {
      // Op de outra página / bloco fora da subárvore carregada.
    }
    if (applied) commit(next)
    lastSeqRef.current = Math.max(lastSeqRef.current, event.seq)
    if (touchesSidebar(event.operation, current)) {
      void refreshPages()
    }
  }

  useEffect(() => {
    if (!token || !activeWorkspaceId) return
    let cancelled = false
    undoRef.current = new UndoManager()
    localOpIdsRef.current = new Set()
    queueMicrotask(() => {
      if (cancelled) return
      commit(null)
      setLoadError(false)
      setSaveState("saved")
      api
        .getPage(token, activeWorkspaceId, pageId)
        .then(async (response) => {
          if (cancelled) return
          lastSeqRef.current = response.seq
          commit(treeFromBlocks(response.page.rootId, response.page.blocks))
          setBreadcrumbs(response.breadcrumbs)
          setRecentEditors(response.recent_editors ?? [])
          // Ops que chegaram entre o GET e o commit (ou durante o load).
          try {
            const { operations } = await catchUpOperations(
              token,
              activeWorkspaceId,
              response.seq
            )
            if (cancelled) return
            for (const entry of operations) {
              applyRemoteEventRef.current({
                workspace_id: activeWorkspaceId,
                seq: entry.seq,
                op_id: entry.op_id,
                actor_id: entry.actor_id,
                operation: entry.operation,
              })
            }
          } catch {
            // O WS/reconnect tenta de novo.
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true)
        })
    })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, commit, pageId, pageRevision, reloadKey, token])

  useEffect(() => {
    if (!token || !activeWorkspaceId || !canWrite) return
    queueRef.current = createOpQueue({
      send: async (operation) => {
        const ack: OperationAck = await api.applyOperation(
          token,
          activeWorkspaceId,
          operation
        )
        lastSeqRef.current = Math.max(lastSeqRef.current, ack.seq)
        return ack
      },
      onStateChange: setSaveState,
    })
    return () => {
      queueRef.current = null
    }
  }, [activeWorkspaceId, canWrite, token])

  // Realtime: WS + presence + catch-up no reconnect.
  const runCatchUp = useCallback(async () => {
    if (!token || !activeWorkspaceId || catchingUpRef.current) return
    catchingUpRef.current = true
    try {
      const { operations } = await catchUpOperations(
        token,
        activeWorkspaceId,
        lastSeqRef.current
      )
      for (const entry of operations) {
        applyRemoteEventRef.current({
          workspace_id: activeWorkspaceId,
          seq: entry.seq,
          op_id: entry.op_id,
          actor_id: entry.actor_id,
          operation: entry.operation,
        })
      }
    } catch {
      // Falha de catch-up: o próximo reconnect tenta de novo.
    } finally {
      catchingUpRef.current = false
    }
  }, [activeWorkspaceId, token])

  const { pagePeers, blockPresence, sendPresence } = useWorkspacePresence(
    activeWorkspaceId,
    pageId,
    (event) => applyRemoteEventRef.current(event),
    () => {
      void runCatchUp()
    }
  )

  useEffect(() => {
    sendPresence(pageId, selectedBlockId)
  }, [pageId, selectedBlockId, sendPresence])

  const dispatchBatch = useCallback(
    (
      ops: Operation[],
      options?: { coalesceKey?: string; breakCoalescing?: boolean }
    ) => {
      if (options?.breakCoalescing) undoRef.current.breakCoalescing()
      const current = treeRef.current
      if (ops.length === 0 || !canWrite || !current) return
      let next = current
      const inverse: Operation[] = []
      const stamped: Operation[] = []
      for (const raw of ops) {
        const op = stampPropVersions(next, raw)
        rememberLocalOp(localOpIdsRef.current, op)
        const result = applyOperation(next, op)
        next = result.tree
        inverse.unshift(...result.inverse)
        stamped.push(op)
      }
      undoRef.current.record(inverse, options?.coalesceKey)
      commit(next)
      // Aplicação local é otimista; a fila serializa o envio e nunca bloqueia a digitação.
      queueRef.current?.push(stamped, options?.coalesceKey)
    },
    [canWrite, commit]
  )

  const updateTitle = useCallback(
    (title: string) => {
      const current = treeRef.current
      if (!current) return
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: current.rootId,
            properties: { title },
          },
        ],
        { coalesceKey: "title" }
      )
    },
    [dispatchBatch]
  )

  // Título e ícone mudam a sidebar, mas só depois que a fila entrega a op:
  // um refresh otimista leria o servidor antes da escrita chegar nele.
  const flushSidebar = useCallback(async () => {
    sidebarDirty.current = true
    await queueRef.current?.drained()
    if (!sidebarDirty.current) return
    sidebarDirty.current = false
    await refreshPages()
  }, [refreshPages])

  const setIcon = useCallback(
    (icon: string | null) => {
      const current = treeRef.current
      if (!current) return
      dispatchBatch(
        [
          {
            type: "update_block",
            opId: opId(),
            blockId: current.rootId,
            properties: { icon },
          },
        ],
        { breakCoalescing: true }
      )
      void flushSidebar()
    },
    [dispatchBatch, flushSidebar]
  )

  const undo = useCallback(() => {
    undoRef.current.breakCoalescing()
    if (!treeRef.current) return
    const { tree: next, ops } = undoRef.current.undo(treeRef.current)
    for (const op of ops) rememberLocalOp(localOpIdsRef.current, op)
    commit(next)
    queueRef.current?.push(ops)
  }, [commit])

  const redo = useCallback(() => {
    undoRef.current.breakCoalescing()
    if (!treeRef.current) return
    const { tree: next, ops } = undoRef.current.redo(treeRef.current)
    for (const op of ops) rememberLocalOp(localOpIdsRef.current, op)
    commit(next)
    queueRef.current?.push(ops)
  }, [commit])

  const toggleCollapsed = useCallback((blockId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }, [])

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLHeadingElement>) => {
      if (!tree) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const firstId = getBlock(tree, tree.rootId).content[0]
        const first = firstId
          ? document.querySelector<HTMLElement>(
              `[data-block-id="${firstId}"] [contenteditable="true"]`
            )
          : null
        first?.focus()
      }
    },
    [redo, tree, undo]
  )

  const pageTitle = tree ? pageProperty(tree, "title") : ""
  const pageIcon = tree ? pageProperty(tree, "icon") : ""
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Os breadcrumbs vêm do servidor, mas a última migalha é a página aberta:
  // ela precisa acompanhar o título/ícone que o usuário está digitando agora.
  const crumbs: Crumb[] = breadcrumbs.map((crumb, index) =>
    index === breadcrumbs.length - 1
      ? { ...crumb, title: pageTitle, icon: pageIcon }
      : crumb
  )

  // Mesmo contrato do BlockEditor: o título nunca é filho React do
  // contenteditable; o DOM só é escrito quando diverge do estado (undo/redo).
  useLayoutEffect(() => {
    const element = titleRef.current
    if (element && element.textContent !== pageTitle) {
      element.textContent = pageTitle
    }
  }, [pageTitle])

  if (loadError) {
    return (
      <main className="grid min-h-svh place-items-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          Não foi possível abrir esta página.
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            Tentar de novo
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-4 border-b bg-background/80 px-6 backdrop-blur">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.id}>
                <BreadcrumbItem>
                  {index === crumbs.length - 1 ? (
                    <BreadcrumbPage data-cy="breadcrumb-current">
                      <span aria-hidden="true" className="mr-1">
                        {crumb.icon || "📄"}
                      </span>
                      {crumb.title || "Sem título"}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href={pagePath(crumb.id)}
                      data-cy={`breadcrumb-${crumb.id}`}
                    >
                      <span aria-hidden="true" className="mr-1">
                        {crumb.icon || "📄"}
                      </span>
                      {crumb.title || "Sem título"}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-3">
          <PresenceAvatarStack live={pagePeers} recent={recentEditors} />
          <span
            data-cy="save-state"
            data-state={canWrite ? saveState : "read-only"}
            className={`text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {canWrite ? SAVE_LABEL[saveState] : "Somente leitura"}
          </span>
        </div>
      </header>

      {saveState === "error" ? (
        <div
          role="alert"
          data-cy="save-error"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm"
        >
          <span>Uma edição foi rejeitada. Recarregue para ver o estado real.</span>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            Recarregar
          </Button>
        </div>
      ) : null}

      <section className="mx-auto flex w-full max-w-[708px] flex-col px-6 py-14 leading-7 md:py-20">
        {!tree ? (
          <div className="space-y-4" data-cy="page-loading">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-4/5" />
          </div>
        ) : (
          <>
            <EmojiPicker
              value={pageProperty(tree, "icon")}
              disabled={!canWrite}
              onSelect={setIcon}
              className="-ml-2 mb-1"
            />
            <h1
              ref={titleRef}
              data-cy="page-title"
              contentEditable={canWrite}
              suppressContentEditableWarning
              spellCheck
              className="mb-6 min-h-12 text-[40px] leading-tight font-bold break-words outline-none empty:before:text-muted-foreground/40 empty:before:content-['Sem_título']"
              onInput={(event: FormEvent<HTMLHeadingElement>) =>
                updateTitle(event.currentTarget.textContent ?? "")
              }
              onBlur={() => {
                undoRef.current.breakCoalescing()
                void flushSidebar()
              }}
              onKeyDown={handleTitleKeyDown}
            />
            <BlockEditor
              tree={tree}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              selectedBlockId={selectedBlockId}
              onSelectedBlockChange={setSelectedBlockId}
              dispatchBatch={dispatchBatch}
              undo={undo}
              redo={redo}
              onOpenPage={(childId) => router.push(pagePath(childId))}
              readOnly={!canWrite}
              blockPresence={blockPresence}
              onUploadImage={
                token && activeWorkspaceId && canWrite
                  ? async (file) => {
                      const presign = await api.presignPageImage(
                        token,
                        activeWorkspaceId,
                        file.type
                      )
                      const headers = new Headers()
                      for (const header of presign.headers) {
                        headers.set(header.name, header.value)
                      }
                      const put = await fetch(presign.upload_url, {
                        method: "PUT",
                        headers,
                        body: file,
                      })
                      if (!put.ok) {
                        throw new Error("Upload falhou")
                      }
                      return { url: presign.public_url, key: presign.key }
                    }
                  : undefined
              }
            />
          </>
        )}
      </section>
    </main>
  )
}
