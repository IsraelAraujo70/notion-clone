"use client"

import type { Operation } from "@reason/core/contracts"
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
import { useSearchParams } from "next/navigation"
import { SparklesIcon } from "lucide-react"

import { useDashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { BlockEditor } from "@/components/editor/BlockEditor"
import { usePageLayout } from "@/components/editor/page-layout-provider"
import { PullRequestSummary } from "@/components/github/molecules/pull-request-summary"
import { GitHubIntegrationDialog } from "@/components/github/organisms/github-integration-dialog"
import { usePageGitHubIntegration } from "@/components/github/use-page-github-integration"
import { EmojiPicker } from "@/components/pages/emoji-picker"
import { PageOptionsMenu } from "@/components/pages/page-options-menu"
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
import { SidebarTrigger } from "@/components/ui/sidebar"
import { api, type Breadcrumb as Crumb, type PageEditor } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  applyOperation,
  getBlock,
  stampPropVersions,
  treeFromBlocks,
  type BlockTree,
} from "@reason/core/engine/tree"
import {
  createOpQueue,
  type OpQueue,
  type SaveState,
} from "@reason/core/engine/op-queue"
import { UndoManager } from "@reason/core/engine/undo"
import { createId } from "@reason/core/id"
import { useWorkspacePresence } from "@/lib/sync/use-presence"
import {
  catchUpOperations,
  operationGroupMetadata,
  RemoteOperationBuffer,
  type AppliedOpEvent,
} from "@/lib/sync/workspace-socket"
import { PresenceAvatarStack } from "@/components/editor/presence-avatars"
import { ShareDialog } from "@/components/pages/share-dialog"
import { useSearchResultHighlight } from "@/components/editor/use-search-result-highlight"
import { OperationGroupCoordinator } from "@/lib/ai/group-coordinator"
import { AiAssistant } from "@/components/ai/organisms/ai-assistant"
import type { AiAction } from "@reason/core/ai/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function opId() {
  return createId()
}

function pageProperty(tree: BlockTree, key: "title" | "icon") {
  const value = getBlock(tree, tree.rootId).properties[key]
  return typeof value === "string" ? value : ""
}

function isActiveBlock(tree: BlockTree, blockId: string) {
  let current = tree.blocks.get(blockId)
  const visited = new Set<string>()
  while (current) {
    if (current.trashedAt || visited.has(current.id)) return false
    visited.add(current.id)
    if (!current.parentId) return true
    current = tree.blocks.get(current.parentId)
  }
  return false
}

const SAVE_LABEL: Record<SaveState, Message> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Could not save",
}

function rememberLocalOp(localOpIds: Set<string>, op: Operation) {
  localOpIds.add(op.opId)
}

function touchesSidebar(op: Operation, tree: BlockTree | null): boolean {
  if (op.type === "insert_block") return op.block.type === "page"
  if (op.type === "transfer_subtree_out" || op.type === "transfer_subtree_in")
    return true
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
  const { t } = useI18n()
  const { fullWidth } = usePageLayout()
  const { openPage } = useDashboardTabs()
  const searchParams = useSearchParams()
  const { token, user } = useAuth()
  const { activeWorkspace, activeWorkspaceId } = useWorkspace()
  const {
    pages,
    canWrite,
    refreshPages,
    pageRevision,
    pageDrag,
    movePageWithinWorkspace,
    endPageDrag,
  } = usePages()

  const [tree, setTree] = useState<BlockTree | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([])
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [loadError, setLoadError] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
  const [pendingAiAction, setPendingAiAction] = useState<AiAction | null>(null)
  const [githubDialogOpen, setGitHubDialogOpen] = useState(false)
  const [recentEditors, setRecentEditors] = useState<PageEditor[]>([])
  const undoRef = useRef(new UndoManager())
  const queueRef = useRef<OpQueue | null>(null)
  const queueGenerationRef = useRef(0)
  // Espelho do estado: as mutações do editor têm efeitos colaterais (undo stack,
  // fila de envio) e não podem morar dentro de um updater do setState.
  const treeRef = useRef<BlockTree | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const sidebarDirty = useRef(false)
  const [remoteBuffer] = useState(() => new RemoteOperationBuffer())
  const localOpIdsRef = useRef(new Set<string>())
  const catchingUpRef = useRef(false)
  const syncReadyRef = useRef(false)
  const syncGenerationRef = useRef(0)
  const socketReadyRef = useRef(false)
  const socketWorkspaceRef = useRef<string | null>(null)
  const aiGroupsRef = useRef(new OperationGroupCoordinator())
  const github = usePageGitHubIntegration({
    token,
    workspaceId: activeWorkspaceId,
    blockId: pageId,
  })

  useEffect(() => {
    performance.clearMarks("reason:editor-mounted")
    performance.mark("reason:editor-mounted", { detail: { pageId } })
  }, [pageId])

  const recordReadyAiGroups = useCallback(() => {
    for (const group of aiGroupsRef.current.takeReady(remoteBuffer.cursor)) {
      undoRef.current.closeGroup(group.groupId)
    }
  }, [remoteBuffer])

  const commit = useCallback((next: BlockTree | null) => {
    treeRef.current = next
    setTree(next)
    if (!next) return
    setSelectedBlockId((current) =>
      current && !isActiveBlock(next, current) ? null : current
    )
    setFocusedBlockId((current) =>
      current && !isActiveBlock(next, current) ? null : current
    )
    setSelectedBlockIds((current) => {
      const active = current.filter((id) => isActiveBlock(next, id))
      return active.length === current.length ? current : active
    })
  }, [])

  const applyRemoteEvent = useCallback(
    (event: AppliedOpEvent) => {
      if (localOpIdsRef.current.delete(event.op_id)) return

      const current = treeRef.current
      if (!current) return
      let next = current
      let applied = false
      try {
        const result = applyOperation(current, event.operation)
        next = result.tree
        applied = true
        const group = operationGroupMetadata(event)
        if (group?.source === "ai" && group.initiated_by === user?.id) {
          if (aiGroupsRef.current.add(group, event.op_id, event.seq)) {
            undoRef.current.recordOpenGroup(group.group_id, result.inverse)
          }
        }
      } catch {
        // Op de outra página / bloco fora da subárvore carregada, ou replay de
        // uma op estrutural que já estava no snapshot inicial.
      }
      if (applied) commit(next)
      if (touchesSidebar(event.operation, current)) {
        void refreshPages()
      }
    },
    [commit, refreshPages, user?.id]
  )

  // Os callbacks do socket não devem recriar a conexão quando refreshPages muda.
  const applyRemoteEventRef = useRef(applyRemoteEvent)
  useEffect(() => {
    applyRemoteEventRef.current = applyRemoteEvent
  }, [applyRemoteEvent])

  const runCatchUp = useCallback(async () => {
    if (
      !token ||
      !activeWorkspaceId ||
      !syncReadyRef.current ||
      !socketReadyRef.current ||
      catchingUpRef.current
    )
      return

    const generation = syncGenerationRef.current
    catchingUpRef.current = true
    try {
      for (;;) {
        const { operations, latestSeq } = await catchUpOperations(
          token,
          activeWorkspaceId,
          remoteBuffer.cursor
        )
        if (!syncReadyRef.current || syncGenerationRef.current !== generation)
          return

        for (const entry of operations) {
          remoteBuffer.enqueue({
            workspace_id: activeWorkspaceId,
            seq: entry.seq,
            op_id: entry.op_id,
            actor_id: entry.actor_id,
            operation: entry.operation,
            group: entry.group,
          })
        }
        remoteBuffer.drain((event) => applyRemoteEventRef.current(event))
        recordReadyAiGroups()

        if (remoteBuffer.cursor < latestSeq) {
          throw new Error(
            `Catch-up stopped at ${remoteBuffer.cursor} before ${latestSeq}`
          )
        }
        if (!remoteBuffer.hasGap()) break
      }
      recordReadyAiGroups()
    } catch {
      // O buffer continua intacto. O próximo hello/reconnect tenta preencher o gap.
    } finally {
      catchingUpRef.current = false
    }
  }, [activeWorkspaceId, recordReadyAiGroups, remoteBuffer, token])

  const receiveRemoteEvent = useCallback(
    (event: AppliedOpEvent) => {
      if (event.workspace_id !== activeWorkspaceId) return
      remoteBuffer.enqueue(event)
      if (!syncReadyRef.current || catchingUpRef.current) return

      remoteBuffer.drain((next) => applyRemoteEventRef.current(next))
      recordReadyAiGroups()
      if (remoteBuffer.hasGap()) void runCatchUp()
    },
    [activeWorkspaceId, recordReadyAiGroups, remoteBuffer, runCatchUp]
  )

  useEffect(() => {
    if (!token || !activeWorkspaceId) return
    let cancelled = false
    if (socketWorkspaceRef.current !== activeWorkspaceId) {
      socketWorkspaceRef.current = activeWorkspaceId
      socketReadyRef.current = false
    }
    syncGenerationRef.current += 1
    syncReadyRef.current = false
    remoteBuffer.reset(0)
    undoRef.current = new UndoManager()
    aiGroupsRef.current.reset()
    localOpIdsRef.current = new Set()
    queueMicrotask(() => {
      if (cancelled) return
      commit(null)
      setSelectedBlockId(null)
      setSelectedBlockIds([])
      setFocusedBlockId(null)
      setPendingAiAction(null)
      setLoadError(false)
      setSaveState("saved")
      api
        .getPage(token, activeWorkspaceId, pageId)
        .then((response) => {
          if (cancelled) return
          remoteBuffer.setBaseline(response.seq)
          commit(treeFromBlocks(response.page.rootId, response.page.blocks))
          setBreadcrumbs(response.breadcrumbs)
          setRecentEditors(response.recent_editors ?? [])
          syncReadyRef.current = true
          performance.clearMarks("reason:page-ready")
          performance.mark("reason:page-ready", { detail: { pageId } })
          if (
            performance.getEntriesByName("reason:tab-open-start").length > 0
          ) {
            performance.clearMeasures("reason:tab-open-to-page-ready")
            performance.measure(
              "reason:tab-open-to-page-ready",
              "reason:tab-open-start",
              "reason:page-ready"
            )
          }
          void runCatchUp()
        })
        .catch(() => {
          syncReadyRef.current = false
          if (!cancelled) setLoadError(true)
        })
    })

    return () => {
      cancelled = true
      syncReadyRef.current = false
      void queueRef.current?.flush().catch(() => {})
    }
  }, [
    activeWorkspaceId,
    commit,
    pageId,
    pageRevision,
    reloadKey,
    remoteBuffer,
    runCatchUp,
    token,
  ])

  useEffect(() => {
    if (!token || !activeWorkspaceId || !canWrite) return
    const generation = queueGenerationRef.current + 1
    queueGenerationRef.current = generation
    const queue = createOpQueue({
      // O ACK confirma a escrita local, mas não prova que todos os `seq`
      // anteriores foram entregues. Só WS/catch-up avançam o cursor contíguo.
      send: (operation) =>
        api.applyOperation(token, activeWorkspaceId, operation),
      onStateChange: (state) => {
        if (queueGenerationRef.current === generation) {
          setSaveState(state)
        }
      },
      onCoalesced: (operation) => localOpIdsRef.current.delete(operation.opId),
    })
    queueRef.current = queue
    return () => {
      if (queueGenerationRef.current === generation) {
        queueGenerationRef.current += 1
      }
      void queue.flush().catch(() => {})
      if (queueRef.current === queue) queueRef.current = null
    }
  }, [activeWorkspaceId, canWrite, pageId, reloadKey, token])

  const { pagePeers, blockPresence, sendPresence } = useWorkspacePresence(
    activeWorkspaceId,
    pageId,
    receiveRemoteEvent,
    () => {
      socketReadyRef.current = true
      void runCatchUp()
    },
    (status) => {
      if (status !== "open") socketReadyRef.current = false
    }
  )

  useEffect(() => {
    sendPresence(pageId, focusedBlockId)
  }, [focusedBlockId, pageId, sendPresence])

  const dispatchBatch = useCallback(
    (
      ops: Operation[],
      options?: { coalesceKey?: string; breakCoalescing?: boolean }
    ) => {
      if (options?.breakCoalescing) {
        undoRef.current.breakCoalescing()
        void queueRef.current?.flush().catch(() => {})
      }
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
    try {
      await queueRef.current?.drained()
    } catch {
      return
    }
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

  useEffect(() => {
    document.title = `${pageTitle || t("Untitled")} · reason`
  }, [pageTitle, t])

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

  useSearchResultHighlight(searchParams.get("block"), tree !== null)

  const openAiAction = useCallback((action: AiAction) => {
    setPendingAiAction(action)
  }, [])

  const completeAiGroup = useCallback(
    (groupId: string, lastSeq: number) => {
      aiGroupsRef.current.complete(groupId, lastSeq)
      recordReadyAiGroups()
      if (remoteBuffer.cursor < lastSeq) void runCatchUp()
    },
    [recordReadyAiGroups, remoteBuffer, runCatchUp]
  )

  if (loadError) {
    return (
      <main className="grid min-h-full place-items-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          {t("Could not open this page.")}
          <Button
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("Try again")}
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-10 flex min-h-12 min-w-0 items-center justify-between gap-2 border-b bg-background/80 px-2 py-1.5 backdrop-blur sm:h-12 sm:gap-4 sm:px-6 sm:py-0">
        <SidebarTrigger
          className="md:hidden"
          aria-label={t("Toggle sidebar")}
        />
        <Breadcrumb
          className="min-w-0 flex-1 overflow-hidden"
          aria-label={t("Breadcrumb")}
        >
          <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.id}>
                <BreadcrumbItem className="min-w-0 shrink last:flex-1 max-sm:not-last:hidden">
                  {index === crumbs.length - 1 ? (
                    <BreadcrumbPage
                      data-cy="breadcrumb-current"
                      className="block truncate"
                    >
                      <span aria-hidden="true" className="mr-1">
                        {crumb.icon || "📄"}
                      </span>
                      {crumb.title || t("Untitled")}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href={pagePath(crumb.id)}
                      data-cy={`breadcrumb-${crumb.id}`}
                      onClick={(event) => {
                        if (
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return
                        }
                        event.preventDefault()
                        openPage(crumb.id, {
                          title: crumb.title,
                          icon: crumb.icon,
                        })
                      }}
                    >
                      <span aria-hidden="true" className="mr-1">
                        {crumb.icon || "📄"}
                      </span>
                      {crumb.title || t("Untitled")}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < crumbs.length - 1 ? (
                  <BreadcrumbSeparator className="max-sm:hidden" />
                ) : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          {tree ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!canWrite}
              aria-label={t("Summarize page with AI")}
              onClick={() =>
                openAiAction({ type: "summarize_page", page_id: pageId })
              }
            >
              <SparklesIcon data-icon="inline-start" />
              <span className="hidden sm:inline">{t("Summarize")}</span>
            </Button>
          ) : null}
          <ShareDialog pageId={pageId} canWrite={canWrite} />
          <PageOptionsMenu
            showGitHub={canWrite || activeWorkspace?.role === "owner"}
            onManageGitHub={() => setGitHubDialogOpen(true)}
          />
          <PresenceAvatarStack live={pagePeers} recent={recentEditors} />
          <span
            data-cy="save-state"
            data-state={canWrite ? saveState : "read-only"}
            className={`text-xs max-sm:sr-only ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {canWrite ? t(SAVE_LABEL[saveState]) : t("Read only")}
          </span>
        </div>
      </header>

      {activeWorkspace ? (
        <GitHubIntegrationDialog
          open={githubDialogOpen}
          onOpenChange={setGitHubDialogOpen}
          integration={github}
          workspaceRole={activeWorkspace.role}
          canWrite={canWrite}
        />
      ) : null}

      {saveState === "error" ? (
        <div
          role="alert"
          data-cy="save-error"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm"
        >
          <span>
            {t("An edit was rejected. Reload to see the current state.")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("Reload")}
          </Button>
        </div>
      ) : null}

      <section
        data-cy="page-content"
        data-layout={fullWidth ? "full-width" : "centered"}
        className={cn(
          "flex w-full flex-col px-4 py-10 leading-7 sm:px-6 sm:py-14 md:py-20",
          fullWidth ? "max-w-none" : "mx-auto max-w-[708px]"
        )}
      >
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
              className="mb-1 -ml-2"
            />
            <h1
              ref={titleRef}
              data-cy="page-title"
              data-block-id={tree.rootId}
              contentEditable={canWrite}
              suppressContentEditableWarning
              spellCheck
              data-placeholder={t("Untitled")}
              className="mb-6 min-h-12 text-[40px] leading-tight font-bold break-words outline-none empty:before:text-muted-foreground/40 empty:before:content-[attr(data-placeholder)]"
              onInput={(event: FormEvent<HTMLHeadingElement>) =>
                updateTitle(event.currentTarget.textContent ?? "")
              }
              onBlur={() => {
                undoRef.current.breakCoalescing()
                void flushSidebar()
              }}
              onKeyDown={handleTitleKeyDown}
            />
            {github.configured && github.link ? (
              <PullRequestSummary
                link={github.link}
                onReview={() =>
                  openPage(pageId, {
                    title: pageProperty(tree, "title"),
                    icon: pageProperty(tree, "icon"),
                    path: `/dashboard/pages/${pageId}/review`,
                  })
                }
              />
            ) : null}
            <BlockEditor
              key={`${activeWorkspaceId}:${pageId}`}
              tree={tree}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              selectedBlockId={selectedBlockId}
              onSelectedBlockChange={setSelectedBlockId}
              onSelectedBlockIdsChange={setSelectedBlockIds}
              onFocusedBlockChange={setFocusedBlockId}
              onAiAction={(action, blockIds) => {
                if (action === "continue_writing" && blockIds[0]) {
                  openAiAction({
                    type: "continue_writing",
                    anchor_block_id: blockIds[0],
                  })
                } else if (blockIds.length > 0) {
                  openAiAction({
                    type: "transform_selection",
                    block_ids: blockIds,
                    instruction: t("Improve clarity and formatting"),
                  })
                }
              }}
              dispatchBatch={dispatchBatch}
              undo={undo}
              redo={redo}
              onOpenPage={(childId) => {
                const page = pages.find((candidate) => candidate.id === childId)
                openPage(childId, { title: page?.title, icon: page?.icon })
              }}
              externalPageDrag={pageDrag}
              onExternalPageDrop={
                pageDrag
                  ? ({ parentId, index }) => {
                      const pageId = pageDrag.id
                      void movePageWithinWorkspace(pageId, parentId, index)
                        .catch(() => toast.error(t("Could not move page")))
                        .finally(endPageDrag)
                    }
                  : undefined
              }
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
                        throw new Error(t("Upload failed"))
                      }
                      return { url: presign.public_url, key: presign.key }
                    }
                  : undefined
              }
            />
          </>
        )}
      </section>
      {token && activeWorkspaceId ? (
        <AiAssistant
          token={token}
          workspaceId={activeWorkspaceId}
          pages={pages}
          pageId={pageId}
          pageBlockIds={tree ? getBlock(tree, tree.rootId).content : []}
          selectedBlockIds={
            selectedBlockIds.length > 0
              ? selectedBlockIds
              : selectedBlockId
                ? [selectedBlockId]
                : []
          }
          anchorBlockId={focusedBlockId ?? selectedBlockId}
          canWrite={canWrite}
          requestedAction={pendingAiAction}
          onRequestedActionHandled={() => setPendingAiAction(null)}
          onRunCompleted={completeAiGroup}
          onOperationApproved={() => void refreshPages()}
          onBeforeMutatingAction={() =>
            queueRef.current?.drained() ?? Promise.resolve()
          }
        />
      ) : null}
    </main>
  )
}
