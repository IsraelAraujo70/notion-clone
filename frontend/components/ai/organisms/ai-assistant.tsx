"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import type { PageSummary } from "@/lib/api"
import { hasPageMention } from "@/lib/ai/page-mentions"
import { useIsMobile } from "@/hooks/use-mobile"
import { citationPath } from "@/lib/ai/citations"
import type {
  AiAction,
  AiCitation,
  AiConversation,
  AiMessage,
} from "@reason/core/ai/contracts"
import {
  appendAssistantDelta,
  reconcilePersistedMessage,
  sortConversations,
} from "@/lib/ai/conversation-state"
import { aiTransport } from "@/lib/ai/transport"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { AiAssistantPanel } from "./ai-assistant-panel"

type Props = {
  token: string
  workspaceId: string
  pages: PageSummary[]
  pageId: string
  pageBlockIds: string[]
  selectedBlockIds: string[]
  anchorBlockId: string | null
  canWrite: boolean
  requestedAction: AiAction | null
  onRequestedActionHandled: () => void
  onRunCompleted: (groupId: string, lastSeq: number) => void
  onBeforeMutatingAction: () => Promise<void>
}

export function AiAssistant(props: Props) {
  const { requestedAction, onRequestedActionHandled } = props
  const router = useRouter()
  const isMobile = useIsMobile()
  const { t } = useI18n()
  const translateEffect = useEffectEvent(t)
  const { selectWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [mentionedPageIds, setMentionedPageIds] = useState<string[]>([])
  const [queuedAction, setQueuedAction] = useState<AiAction | null>(null)
  const [streamedText, setStreamedText] = useState("")
  const [tools, setTools] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pollingAbortRef = useRef<AbortController | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const conversationListRequestRef = useRef(0)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const requestContextRef = useRef({
    token: props.token,
    workspaceId: props.workspaceId,
  })

  useEffect(() => {
    requestContextRef.current = {
      token: props.token,
      workspaceId: props.workspaceId,
    }
  }, [props.token, props.workspaceId])

  const isCurrentRequest = useCallback(
    (generation: number, signal?: AbortSignal) =>
      generationRef.current === generation &&
      requestContextRef.current.token === props.token &&
      requestContextRef.current.workspaceId === props.workspaceId &&
      !signal?.aborted,
    [props.token, props.workspaceId]
  )

  const loadConversations = useCallback(
    async (signal?: AbortSignal) => {
      const generation = generationRef.current
      const request = ++conversationListRequestRef.current
      const next = sortConversations(
        await aiTransport.listConversations(
          props.token,
          props.workspaceId,
          signal
        )
      )
      if (
        isCurrentRequest(generation, signal) &&
        conversationListRequestRef.current === request &&
        requestContextRef.current.workspaceId === props.workspaceId
      ) {
        setConversations(next)
      }
    },
    [isCurrentRequest, props.token, props.workspaceId]
  )

  useEffect(() => {
    generationRef.current += 1
    conversationIdRef.current = null
    abortRef.current?.abort()
    pollingAbortRef.current?.abort()
    historyAbortRef.current?.abort()
    const request = new AbortController()
    historyAbortRef.current = request
    queueMicrotask(() => {
      if (request.signal.aborted) return
      setConversationId(null)
      setConversations([])
      setMessages([])
      setStreamedText("")
      setMentionedPageIds([])
      setTools([])
      setBusy(false)
      setStopping(false)
      setStatus(null)
      setError(null)
      void loadConversations(request.signal).catch((caught) => {
        if (
          isCurrentRequest(generationRef.current, request.signal) &&
          !(caught instanceof DOMException && caught.name === "AbortError")
        ) {
          setError(translateEffect("Could not load conversations."))
        }
      })
    })
    return () => {
      request.abort()
      pollingAbortRef.current?.abort()
    }
  }, [isCurrentRequest, loadConversations])

  const closeAssistant = useCallback(() => {
    setOpen(false)
    queueMicrotask(() => launcherRef.current?.focus())
  }, [])

  const handleRequestedAction = useEffectEvent(onRequestedActionHandled)

  useEffect(() => {
    if (!open || isMobile) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeAssistant, isMobile, open])

  useEffect(() => {
    if (!requestedAction) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setQueuedAction(requestedAction)
      setMentionedPageIds([])
      setDraft(
        requestedAction.type === "summarize_page"
          ? translateEffect("Summarize this page")
          : requestedAction.type === "continue_writing"
            ? translateEffect("Continue writing in the same style")
            : requestedAction.type === "transform_selection"
              ? requestedAction.instruction
              : requestedAction.type === "transform_page"
                ? requestedAction.instruction
                : requestedAction.prompt
      )
      setOpen(true)
      handleRequestedAction()
    })
    return () => {
      active = false
    }
  }, [requestedAction])

  const selectConversation = async (id: string) => {
    historyAbortRef.current?.abort()
    const request = new AbortController()
    historyAbortRef.current = request
    const generation = generationRef.current
    conversationIdRef.current = id
    setConversationId(id)
    setShowHistory(false)
    setError(null)
    try {
      const history = await aiTransport.getConversation(
        props.token,
        props.workspaceId,
        id,
        request.signal
      )
      if (
        isCurrentRequest(generation, request.signal) &&
        conversationIdRef.current === id &&
        requestContextRef.current.workspaceId === props.workspaceId
      ) {
        setMessages(history.messages)
      }
    } catch (caught) {
      if (
        isCurrentRequest(generation, request.signal) &&
        !(caught instanceof DOMException && caught.name === "AbortError")
      ) {
        setError(t("Could not open the conversation."))
      }
    }
  }

  const submit = async () => {
    const prompt = draft.trim()
    if (!prompt || busy) return
    const generation = generationRef.current
    setError(null)
    setStatus(null)
    setBusy(true)
    setStopping(false)
    const abort = new AbortController()
    abortRef.current = abort
    let id = conversationId
    let runId: string | null = null
    try {
      const activeMentionedPageIds = mentionedPageIds.filter((id) => {
        const page = props.pages.find((candidate) => candidate.id === id)
        return page
          ? hasPageMention(prompt, page.title || t("Untitled"))
          : false
      })
      const action = queuedAction ?? {
        type: "workspace_agent" as const,
        prompt,
        page_id: props.pageId,
        mentioned_page_ids: activeMentionedPageIds,
        selection: props.selectedBlockIds,
        anchor_block_id: props.anchorBlockId ?? undefined,
      }
      if (action.type !== "workspace_agent") {
        await props.onBeforeMutatingAction()
      }
      if (!isCurrentRequest(generation, abort.signal)) return
      if (!id) {
        const created = await aiTransport.createConversation(
          props.token,
          props.workspaceId,
          abort.signal
        )
        if (!isCurrentRequest(generation, abort.signal)) return
        id = created.id
        conversationIdRef.current = id
        setConversationId(id)
        setConversations((current) => sortConversations([created, ...current]))
      }
      const temporary: AiMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: prompt,
        created_at: new Date().toISOString(),
      }
      setMessages((current) => [...current, temporary])
      setDraft("")
      setMentionedPageIds([])
      setQueuedAction(null)
      setStreamedText("")
      setTools([])
      await aiTransport.streamMessage(
        props.token,
        props.workspaceId,
        id,
        { prompt, action },
        (event) => {
          if (
            !isCurrentRequest(generation, abort.signal) ||
            conversationIdRef.current !== id
          )
            return
          if (event.type === "run_started") {
            runId = event.run_id
          } else if (event.type === "text_delta") {
            setStreamedText((current) =>
              appendAssistantDelta(current, event.delta)
            )
          } else if (event.type === "tool_started") {
            setTools((current) => [...current, event.label ?? event.tool])
          } else if (event.type === "tool_completed") {
            setTools((current) =>
              current.filter((tool) => tool !== (event.label ?? event.tool))
            )
          } else if (event.type === "run_completed") {
            setTools([])
            setStreamedText("")
            if (event.message) {
              const message = {
                ...event.message,
                citations: event.message.citations ?? event.citations,
              }
              setMessages((current) =>
                reconcilePersistedMessage(current, message)
              )
            }
            if (event.group_id && typeof event.last_seq === "number") {
              props.onRunCompleted(event.group_id, event.last_seq)
            }
          } else if (event.type === "run_failed") {
            setTools([])
            setError(event.message)
            if (event.group_id && typeof event.last_seq === "number") {
              props.onRunCompleted(event.group_id, event.last_seq)
            }
          }
        },
        abort.signal
      )
      try {
        const history = await aiTransport.getConversation(
          props.token,
          props.workspaceId,
          id,
          abort.signal
        )
        if (
          !isCurrentRequest(generation, abort.signal) ||
          conversationIdRef.current !== id
        )
          return
        setMessages(history.messages)
        await loadConversations(abort.signal)
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          void loadConversations(abort.signal).catch(() => {})
        }
      }
    } catch (caught) {
      if (runId && isCurrentRequest(generation)) {
        const polling = new AbortController()
        pollingAbortRef.current?.abort()
        pollingAbortRef.current = polling
        try {
          const run = await aiTransport.waitForRun(
            props.token,
            props.workspaceId,
            runId,
            polling.signal
          )
          if (isCurrentRequest(generation, polling.signal)) {
            if (run.operation_group_id && typeof run.last_seq === "number") {
              props.onRunCompleted(run.operation_group_id, run.last_seq)
            }
            if (run.status === "failed") {
              setError(run.error ?? t("The response failed."))
            } else {
              setStatus(t("The run completed on the server."))
            }
          }
        } catch (pollError) {
          if (
            isCurrentRequest(generation, polling.signal) &&
            !(
              pollError instanceof DOMException &&
              pollError.name === "AbortError"
            )
          ) {
            setStatus(
              t(
                "Could not confirm the run's final status. Confirmed changes remain."
              )
            )
          }
        } finally {
          if (pollingAbortRef.current === polling) {
            pollingAbortRef.current = null
          }
        }
      } else if (
        caught instanceof DOMException &&
        caught.name === "AbortError"
      ) {
        if (isCurrentRequest(generation)) {
          setStatus(t("Display stopped."))
        }
      } else if (isCurrentRequest(generation)) {
        setError(
          caught instanceof Error ? caught.message : t("The response failed.")
        )
      }
    } finally {
      if (isCurrentRequest(generation)) {
        abortRef.current = null
        setStreamedText("")
        setTools([])
        setBusy(false)
        setStopping(false)
      }
    }
  }

  const openCitation = (citation: AiCitation) => {
    if (citation.workspace_id !== props.workspaceId) {
      selectWorkspace(citation.workspace_id)
    }
    closeAssistant()
    router.push(citationPath(citation))
  }

  const content = (
    <AiAssistantPanel
      showHistory={showHistory}
      conversations={conversations}
      pages={props.pages}
      messages={messages}
      streamedText={streamedText}
      tools={tools}
      busy={busy}
      error={error}
      status={status}
      stopping={stopping}
      draft={draft}
      mentionedPageIds={mentionedPageIds}
      canWrite={props.canWrite}
      pageId={props.pageId}
      pageBlockIds={props.pageBlockIds}
      selectedBlockIds={props.selectedBlockIds}
      onNewConversation={() => {
        historyAbortRef.current?.abort()
        setConversationId(null)
        conversationIdRef.current = null
        setMessages([])
        setMentionedPageIds([])
        setShowHistory(false)
      }}
      onToggleHistory={() => setShowHistory((value) => !value)}
      onSelectConversation={(id) => void selectConversation(id)}
      onAction={(action, prompt) => {
        setQueuedAction(action)
        setDraft(prompt)
        setMentionedPageIds([])
      }}
      onOpenCitation={openCitation}
      onDraftChange={(nextDraft) => {
        setDraft(nextDraft)
        setMentionedPageIds((current) =>
          current.filter((id) => {
            const page = props.pages.find((candidate) => candidate.id === id)
            return page
              ? hasPageMention(nextDraft, page.title || t("Untitled"))
              : false
          })
        )
      }}
      onMentionPage={(pageId, nextDraft) => {
        setDraft(nextDraft)
        setMentionedPageIds((current) => {
          const selected = props.pages.find((page) => page.id === pageId)
          const withoutSameTitle = current.filter((id) => {
            const page = props.pages.find((candidate) => candidate.id === id)
            return page?.title !== selected?.title
          })
          return [...withoutSameTitle, pageId]
        })
      }}
      onSubmit={() => void submit()}
      onCancel={() => {
        setStopping(true)
        setStatus(t("Stopping local display only..."))
        abortRef.current?.abort()
      }}
      onClose={closeAssistant}
    />
  )

  return (
    <>
      <Button
        ref={launcherRef}
        className="fixed right-4 bottom-4 z-40 h-11 rounded-full px-4 shadow-lg md:right-6 md:bottom-6"
        aria-label={t("Open Reason AI")}
        onClick={() => setOpen(true)}
      >
        <SparklesIcon /> {t("Ask AI")}
      </Button>
      {isMobile ? (
        <Sheet
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : closeAssistant())}
        >
          <SheetContent
            side="bottom"
            className="h-[88svh] gap-0 rounded-t-2xl p-0"
            aria-describedby="ai-sheet-description"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t("Reason AI")}</SheetTitle>
              <SheetDescription id="ai-sheet-description">
                {t("Workspace assistant")}
              </SheetDescription>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      ) : open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={t("Reason AI")}
          className="fixed right-6 bottom-20 z-40 flex h-[min(680px,calc(100svh-7rem))] w-[400px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
        >
          {content}
        </section>
      ) : null}
    </>
  )
}
