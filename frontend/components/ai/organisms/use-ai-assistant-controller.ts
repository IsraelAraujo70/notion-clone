"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

import { ApiError, type PageSummary } from "@/lib/api"
import { hasPageMention } from "@/lib/ai/page-mentions"
import {
  activeConversationStorageKey,
  appendAssistantDelta,
  conversationActivityStorageKey,
  reconcilePersistedMessage,
  sortConversations,
} from "@/lib/ai/conversation-state"
import { aiTransport } from "@/lib/ai/transport"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type {
  AiAction,
  AiConversation,
  AiMessage,
  AiRun,
} from "@reason/core/ai/contracts"
import type { Operation } from "@reason/core/contracts"

export type AiOperationApproval = {
  runId: string
  proposalId: string
  operation: Operation
  decision?: boolean
  status:
    | "pending"
    | "deciding"
    | "applying"
    | "approved"
    | "rejected"
    | "failed"
}

export type AiToolActivity = {
  id: string
  name: string
  status: "running" | "completed"
}

export type AiCompletedActivity = {
  id: string
  assistantMessageId: string | null
  tools: AiToolActivity[]
  approvals: AiOperationApproval[]
}

type Props = {
  token: string
  workspaceId: string
  pages: PageSummary[]
  pageId?: string
  selectedBlockIds: string[]
  anchorBlockId: string | null
  requestedAction: AiAction | null
  onRequestedActionHandled: () => void
  onRunCompleted: (groupId: string, lastSeq: number) => void
  onOperationApproved: (operation: Operation) => void
  onBeforeMutatingAction: () => Promise<void>
  onRequestOpen: () => void
}

function recoveredApprovalStatus(
  approval: AiOperationApproval,
  run: AiRun | null
): "approved" | "rejected" | "failed" {
  if (approval.decision === false) return "rejected"
  if (
    run?.status === "completed" &&
    run.operation_group_id &&
    typeof run.last_seq === "number"
  ) {
    return "approved"
  }
  return "failed"
}

export function useAiAssistantController(props: Props) {
  const { t } = useI18n()
  const translateEffect = useEffectEvent(t)
  const recoveryToken = props.token
  const recoveryWorkspaceId = props.workspaceId
  const onRunRecovered = props.onRunCompleted
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [activityHydratedId, setActivityHydratedId] = useState<string | null>(
    null
  )
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [activities, setActivities] = useState<AiCompletedActivity[]>([])
  const [draft, setDraft] = useState("")
  const [mentionedPageIds, setMentionedPageIds] = useState<string[]>([])
  const [queuedAction, setQueuedAction] = useState<AiAction | null>(null)
  const [streamedText, setStreamedText] = useState("")
  const [tools, setTools] = useState<AiToolActivity[]>([])
  const [approvals, setApprovals] = useState<AiOperationApproval[]>([])
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const approvalOperationsRef = useRef(new Map<string, Operation>())
  const recoveredApprovalIdsRef = useRef(new Set<string>())
  const pollingAbortRef = useRef<AbortController | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const conversationListRequestRef = useRef(0)
  const toolSequenceRef = useRef(0)
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

  const recoverRun = useCallback(
    async (runId: string, generation: number) => {
      const polling = new AbortController()
      pollingAbortRef.current?.abort()
      pollingAbortRef.current = polling
      setBusy(true)
      try {
        const run = await aiTransport.waitForRun(
          recoveryToken,
          recoveryWorkspaceId,
          runId,
          polling.signal
        )
        if (isCurrentRequest(generation, polling.signal)) {
          if (run.operation_group_id && typeof run.last_seq === "number") {
            onRunRecovered(run.operation_group_id, run.last_seq)
          }
          if (run.status === "failed") {
            setError(run.error ?? t("The response failed."))
          } else {
            setStatus(t("The run completed on the server."))
          }
        }
        return run
      } catch (caught) {
        if (
          caught instanceof DOMException &&
          caught.name === "AbortError" &&
          pollingAbortRef.current === polling &&
          isCurrentRequest(generation)
        ) {
          setStatus(t("Display stopped."))
        }
        if (
          isCurrentRequest(generation, polling.signal) &&
          !(caught instanceof DOMException && caught.name === "AbortError")
        ) {
          setStatus(
            t(
              "Could not confirm the run's final status. Confirmed changes remain."
            )
          )
        }
        return null
      } finally {
        const ownsPolling = pollingAbortRef.current === polling
        if (ownsPolling) {
          pollingAbortRef.current = null
        }
        if (ownsPolling && isCurrentRequest(generation)) {
          setBusy(false)
          setStopping(false)
        }
      }
    },
    [
      isCurrentRequest,
      onRunRecovered,
      recoveryToken,
      recoveryWorkspaceId,
      t,
    ]
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
      return next
    },
    [isCurrentRequest, props.token, props.workspaceId]
  )

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    conversationIdRef.current = null
    abortRef.current?.abort()
    pollingAbortRef.current?.abort()
    historyAbortRef.current?.abort()
    const request = new AbortController()
    historyAbortRef.current = request
    queueMicrotask(() => {
      if (request.signal.aborted) return
      setConversationId(null)
      setActivityHydratedId(null)
      setConversations([])
      setMessages([])
      setActivities([])
      setStreamedText("")
      setMentionedPageIds([])
      setTools([])
      toolSequenceRef.current = 0
      setApprovals([])
      approvalOperationsRef.current.clear()
      recoveredApprovalIdsRef.current.clear()
      setBusy(false)
      setStopping(false)
      setStatus(null)
      setError(null)
      void loadConversations(request.signal)
        .then(async (next) => {
          if (!isCurrentRequest(generation, request.signal)) return
          const storageKey = activeConversationStorageKey(props.workspaceId)
          const storedId = window.sessionStorage.getItem(storageKey)
          if (!storedId) return
          if (!next.some((conversation) => conversation.id === storedId)) {
            window.sessionStorage.removeItem(storageKey)
            return
          }

          conversationIdRef.current = storedId
          setConversationId(storedId)
          const storedActivity = window.sessionStorage.getItem(
            conversationActivityStorageKey(props.workspaceId, storedId)
          )
          if (storedActivity) {
            try {
              const parsed = JSON.parse(storedActivity) as {
                activities?: AiCompletedActivity[]
                tools?: AiToolActivity[]
                approvals?: AiOperationApproval[]
              }
              setActivities(
                Array.isArray(parsed.activities) ? parsed.activities : []
              )
              setTools(Array.isArray(parsed.tools) ? parsed.tools : [])
              const storedApprovals = Array.isArray(parsed.approvals)
                ? parsed.approvals
                : []
              setApprovals(storedApprovals)
              for (const approval of storedApprovals) {
                if (
                  approval.status === "pending" ||
                  approval.status === "deciding" ||
                  approval.status === "applying"
                ) {
                  approvalOperationsRef.current.set(
                    approval.proposalId,
                    approval.operation
                  )
                  recoveredApprovalIdsRef.current.add(approval.proposalId)
                }
              }
            } catch {
              window.sessionStorage.removeItem(
                conversationActivityStorageKey(props.workspaceId, storedId)
              )
            }
          }
          setActivityHydratedId(storedId)
          const history = await aiTransport.getConversation(
            props.token,
            props.workspaceId,
            storedId,
            request.signal
          )
          if (
            isCurrentRequest(generation, request.signal) &&
            conversationIdRef.current === storedId
          ) {
            setMessages(history.messages)
          }
        })
        .catch((caught) => {
          if (
            isCurrentRequest(generation, request.signal) &&
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
  }, [isCurrentRequest, loadConversations, props.token, props.workspaceId])

  useEffect(() => {
    if (!conversationId || activityHydratedId !== conversationId) {
      return
    }
    window.sessionStorage.setItem(
      conversationActivityStorageKey(props.workspaceId, conversationId),
      JSON.stringify({
        activities,
        tools,
        approvals,
      })
    )
  }, [
    activityHydratedId,
    activities,
    approvals,
    conversationId,
    props.workspaceId,
    tools,
  ])

  useEffect(() => {
    if (!conversationId || activityHydratedId !== conversationId || busy) {
      return
    }
    const applying = approvals.find(
      (approval) =>
        (approval.status === "deciding" ||
          approval.status === "applying") &&
        recoveredApprovalIdsRef.current.has(approval.proposalId)
    )
    if (!applying) return
    recoveredApprovalIdsRef.current.delete(applying.proposalId)
    const generation = generationRef.current
    void recoverRun(applying.runId, generation).then((run) => {
      if (!isCurrentRequest(generation)) return
      const status = recoveredApprovalStatus(applying, run)
      setApprovals((current) =>
        current.map((approval) =>
          approval.proposalId === applying.proposalId
            ? { ...approval, status }
            : approval
        )
      )
    })
  }, [activityHydratedId, approvals, busy, conversationId, isCurrentRequest, recoverRun])

  const handleRequestedAction = useEffectEvent(props.onRequestedActionHandled)
  const requestOpen = useEffectEvent(props.onRequestOpen)

  useEffect(() => {
    if (!props.requestedAction) return
    let active = true
    queueMicrotask(() => {
      if (!active || !props.requestedAction) return
      const action = props.requestedAction
      setQueuedAction(action)
      setMentionedPageIds([])
      setDraft(
        action.type === "summarize_page"
          ? translateEffect("Summarize this page")
          : action.type === "continue_writing"
            ? translateEffect("Continue writing in the same style")
            : action.type === "transform_selection"
              ? action.instruction
              : action.type === "transform_page"
                ? action.instruction
                : action.prompt
      )
      requestOpen()
      handleRequestedAction()
    })
    return () => {
      active = false
    }
  }, [props.requestedAction])

  const selectConversation = async (id: string) => {
    historyAbortRef.current?.abort()
    const request = new AbortController()
    historyAbortRef.current = request
    const generation = generationRef.current
    conversationIdRef.current = id
    setConversationId(id)
    setActivityHydratedId(null)
    setActivities([])
    setTools([])
    setApprovals([])
    approvalOperationsRef.current.clear()
    recoveredApprovalIdsRef.current.clear()
    window.sessionStorage.setItem(
      activeConversationStorageKey(props.workspaceId),
      id
    )
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
        const storedActivity = window.sessionStorage.getItem(
          conversationActivityStorageKey(props.workspaceId, id)
        )
        if (storedActivity) {
          try {
            const parsed = JSON.parse(storedActivity) as {
              activities?: AiCompletedActivity[]
              tools?: AiToolActivity[]
              approvals?: AiOperationApproval[]
            }
            setActivities(
              Array.isArray(parsed.activities) ? parsed.activities : []
            )
            setTools(Array.isArray(parsed.tools) ? parsed.tools : [])
            const storedApprovals = Array.isArray(parsed.approvals)
              ? parsed.approvals
              : []
            setApprovals(storedApprovals)
            for (const approval of storedApprovals) {
              if (
                approval.status === "pending" ||
                approval.status === "deciding" ||
                approval.status === "applying"
              ) {
                approvalOperationsRef.current.set(
                  approval.proposalId,
                  approval.operation
                )
                recoveredApprovalIdsRef.current.add(approval.proposalId)
              }
            }
          } catch {
            setActivities([])
            setTools([])
            setApprovals([])
          }
        } else {
          setActivities([])
          setTools([])
          setApprovals([])
        }
        setActivityHydratedId(id)
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
    if (tools.length > 0 || approvals.length > 0) {
      const assistantMessage = messages.findLast(
        (message) => message.role === "assistant"
      )
      setActivities((current) => [
        ...current,
        {
          id:
            tools[0]?.id ??
            approvals[0]?.proposalId ??
            `activity-${Date.now()}`,
          assistantMessageId: assistantMessage?.id ?? null,
          tools,
          approvals: approvals.filter(
            (approval) =>
              approval.status === "approved" || approval.status === "rejected"
          ),
        },
      ])
    }
    setTools([])
    toolSequenceRef.current = 0
    setApprovals([])
    approvalOperationsRef.current.clear()
    recoveredApprovalIdsRef.current.clear()
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
      const action: AiAction = queuedAction ?? {
        type: "workspace_agent",
        prompt,
        ...(props.pageId ? { page_id: props.pageId } : {}),
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
        setActivityHydratedId(id)
        window.sessionStorage.setItem(
          activeConversationStorageKey(props.workspaceId),
          id
        )
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
            const id = `${runId ?? "run"}:${toolSequenceRef.current++}`
            setTools((current) => [
              ...current.map((tool) =>
                tool.status === "running"
                  ? { ...tool, status: "completed" as const }
                  : tool
              ),
              { id, name: event.tool, status: "running" },
            ])
          } else if (event.type === "tool_completed") {
            setTools((current) =>
              current.map((tool) =>
                tool.status === "running" && tool.name === event.tool
                  ? { ...tool, status: "completed" }
                  : tool
              )
            )
          } else if (event.type === "approval_requested") {
            approvalOperationsRef.current.set(
              event.proposal_id,
              event.operation
            )
            setApprovals((current) => [
              ...current.filter(
                (approval) => approval.proposalId !== event.proposal_id
              ),
              {
                runId: event.run_id,
                proposalId: event.proposal_id,
                operation: event.operation,
                status: event.auto_approved ? "applying" : "pending",
              },
            ])
          } else if (event.type === "approval_resolved") {
            if (event.approved) {
              const operation = approvalOperationsRef.current.get(
                event.proposal_id
              )
              if (operation) props.onOperationApproved(operation)
            }
            approvalOperationsRef.current.delete(event.proposal_id)
            setApprovals((current) =>
              current.map((approval) =>
                approval.proposalId === event.proposal_id
                  ? {
                      ...approval,
                      status: event.approved ? "approved" : "rejected",
                    }
                  : approval
              )
            )
          } else if (event.type === "run_completed") {
            setTools((current) =>
              current.map((tool) => ({ ...tool, status: "completed" }))
            )
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
            setTools((current) =>
              current.map((tool) => ({ ...tool, status: "completed" }))
            )
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
      if (caught instanceof DOMException && caught.name === "AbortError") {
        if (isCurrentRequest(generation)) {
          setStatus(t("Display stopped."))
        }
      } else if (runId && isCurrentRequest(generation)) {
        await recoverRun(runId, generation)
      } else if (isCurrentRequest(generation)) {
        setError(
          caught instanceof Error ? caught.message : t("The response failed.")
        )
      }
    } finally {
      if (isCurrentRequest(generation)) {
        abortRef.current = null
        setStreamedText("")
        setBusy(false)
        setStopping(false)
      }
    }
  }

  const decideOperation = async (
    proposalId: string,
    approved: boolean,
    allowConversation = false
  ) => {
    const proposal = approvals.find((item) => item.proposalId === proposalId)
    if (!proposal || proposal.status !== "pending") return
    const recovered = recoveredApprovalIdsRef.current.delete(proposalId)
    setApprovals((current) =>
      current.map((item) =>
        item.proposalId === proposalId
          ? { ...item, status: "deciding", decision: approved }
          : item
      )
    )
    try {
      await aiTransport.decideOperation(
        props.token,
        props.workspaceId,
        proposal.runId,
        proposal.proposalId,
        approved,
        allowConversation
      )
      if (recovered) {
        setApprovals((current) =>
          current.map((item) =>
            item.proposalId === proposalId
              ? { ...item, status: approved ? "applying" : "rejected" }
              : item
          )
        )
        const run = await recoverRun(proposal.runId, generationRef.current)
        const status = recoveredApprovalStatus(
          { ...proposal, decision: approved },
          run
        )
        setApprovals((current) =>
          current.map((item) =>
            item.proposalId === proposalId ? { ...item, status } : item
          )
        )
      }
    } catch (caught) {
      if (recovered && caught instanceof ApiError && caught.status === 400) {
        const run = await recoverRun(proposal.runId, generationRef.current)
        const status = recoveredApprovalStatus(
          { ...proposal, decision: approved },
          run
        )
        setApprovals((current) =>
          current.map((item) =>
            item.proposalId === proposalId ? { ...item, status } : item
          )
        )
        return
      }
      if (recovered) recoveredApprovalIdsRef.current.add(proposalId)
      setApprovals((current) =>
        current.map((item) =>
          item.proposalId === proposalId ? { ...item, status: "pending" } : item
        )
      )
      setError(
        caught instanceof Error ? caught.message : t("The response failed.")
      )
    }
  }

  return {
    showHistory,
    conversations,
    messages,
    activities,
    streamedText,
    tools,
    approvals,
    busy,
    stopping,
    status,
    error,
    draft,
    mentionedPageIds,
    selectConversation: (id: string) => void selectConversation(id),
    toggleHistory: () => setShowHistory((value) => !value),
    newConversation: () => {
      historyAbortRef.current?.abort()
      setConversationId(null)
      setActivityHydratedId(null)
      conversationIdRef.current = null
      window.sessionStorage.removeItem(
        activeConversationStorageKey(props.workspaceId)
      )
      setMessages([])
      setActivities([])
      setStreamedText("")
      setTools([])
      toolSequenceRef.current = 0
      setApprovals([])
      approvalOperationsRef.current.clear()
      recoveredApprovalIdsRef.current.clear()
      setMentionedPageIds([])
      setShowHistory(false)
    },
    queueAction: (action: AiAction, prompt: string) => {
      setQueuedAction(action)
      setDraft(prompt)
      setMentionedPageIds([])
    },
    changeDraft: (nextDraft: string) => {
      setDraft(nextDraft)
      setMentionedPageIds((current) =>
        current.filter((id) => {
          const page = props.pages.find((candidate) => candidate.id === id)
          return page
            ? hasPageMention(nextDraft, page.title || t("Untitled"))
            : false
        })
      )
    },
    mentionPage: (pageId: string, nextDraft: string) => {
      setDraft(nextDraft)
      setMentionedPageIds((current) => {
        const selected = props.pages.find((page) => page.id === pageId)
        const withoutSameTitle = current.filter((id) => {
          const page = props.pages.find((candidate) => candidate.id === id)
          return page?.title !== selected?.title
        })
        return [...withoutSameTitle, pageId]
      })
    },
    submit: () => void submit(),
    decideOperation: (
      proposalId: string,
      approved: boolean,
      allowConversation = false
    ) => void decideOperation(proposalId, approved, allowConversation),
    cancel: () => {
      setStopping(true)
      setStatus(t("Stopping local display only..."))
      abortRef.current?.abort()
      pollingAbortRef.current?.abort()
    },
  }
}
