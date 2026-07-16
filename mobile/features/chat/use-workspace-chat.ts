import type {
  AiConversation,
  AiMessage,
  AiRunEvent,
} from "@reason/core/ai/contracts"
import * as Haptics from "expo-haptics"
import { useEffect, useRef, useState } from "react"

import { aiTransport } from "@/lib/ai-transport"
import { readCache, writeCache } from "@/lib/cache"

export type ToolActivity = {
  id: string
  label: string
  state: "running" | "completed"
}

function sortConversations(conversations: AiConversation[]) {
  return [...conversations].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function toolLabel(tool: string, label?: string) {
  if (label) return label
  if (tool === "search_workspace") return "Pesquisando no workspace"
  if (tool === "read_page") return "Lendo uma pagina"
  if (tool === "select_citations") return "Organizando fontes"
  return "Consultando o workspace"
}

export function useWorkspaceChat({
  contextPageId,
  token,
  workspaceId,
}: {
  contextPageId: string
  token: string
  workspaceId: string
}) {
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [streamedText, setStreamedText] = useState("")
  const [activities, setActivities] = useState<ToolActivity[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const conversationIdRef = useRef<string | null>(null)
  const lastHapticAtRef = useRef(0)
  const draftCacheKey = `ai-draft:${workspaceId}`

  useEffect(() => {
    const generation = ++generationRef.current
    const abort = new AbortController()
    abortRef.current?.abort()
    abortRef.current = abort
    setLoading(true)
    setError(null)

    Promise.all([
      aiTransport.listConversations(token, workspaceId, abort.signal),
      readCache<string>(draftCacheKey),
    ])
      .then(async ([loadedConversations, cachedDraft]) => {
        if (generationRef.current !== generation || abort.signal.aborted) return
        const sorted = sortConversations(loadedConversations)
        setConversations(sorted)
        if (cachedDraft) setDraft(cachedDraft)
        const latest = sorted[0]
        if (!latest) return
        conversationIdRef.current = latest.id
        setConversationId(latest.id)
        const history = await aiTransport.getConversation(
          token,
          workspaceId,
          latest.id,
          abort.signal
        )
        if (generationRef.current === generation && !abort.signal.aborted) {
          setMessages(history.messages)
        }
      })
      .catch((caught) => {
        if (!isAbortError(caught) && generationRef.current === generation) {
          setError("Nao foi possivel carregar as conversas.")
        }
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false)
      })

    return () => abort.abort()
  }, [token, workspaceId])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void writeCache(draftCacheKey, draft)
    }, 250)
    return () => clearTimeout(timeout)
  }, [draft, draftCacheKey])

  async function refreshConversations(signal?: AbortSignal) {
    const next = await aiTransport.listConversations(token, workspaceId, signal)
    setConversations(sortConversations(next))
  }

  async function selectConversation(id: string) {
    if (busy || id === conversationIdRef.current) return
    const abort = new AbortController()
    abortRef.current?.abort()
    abortRef.current = abort
    conversationIdRef.current = id
    setConversationId(id)
    setMessages([])
    setStreamedText("")
    setActivities([])
    setLoading(true)
    setError(null)
    try {
      const history = await aiTransport.getConversation(
        token,
        workspaceId,
        id,
        abort.signal
      )
      if (!abort.signal.aborted && conversationIdRef.current === id) {
        setMessages(history.messages)
      }
    } catch (caught) {
      if (!isAbortError(caught)) setError("Nao foi possivel abrir a conversa.")
    } finally {
      if (!abort.signal.aborted) setLoading(false)
    }
  }

  function newConversation() {
    if (busy) return
    abortRef.current?.abort()
    conversationIdRef.current = null
    setConversationId(null)
    setMessages([])
    setStreamedText("")
    setActivities([])
    setError(null)
    setStatus(null)
  }

  function handleEvent(event: AiRunEvent) {
    if (event.type === "run_started") {
      void Haptics.selectionAsync()
      return
    }
    if (event.type === "text_delta") {
      setStreamedText((current) => current + event.delta)
      const now = Date.now()
      if (now - lastHapticAtRef.current >= 320) {
        lastHapticAtRef.current = now
        void Haptics.selectionAsync()
      }
      return
    }
    if (event.type === "tool_started") {
      const label = toolLabel(event.tool, event.label)
      setActivities((current) => [
        ...current
          .filter((item) => item.id !== event.tool)
          .map((item) => ({ ...item, state: "completed" as const })),
        { id: event.tool, label, state: "running" },
      ])
      return
    }
    if (event.type === "tool_completed") {
      setActivities((current) =>
        current.map((item) =>
          item.id === event.tool ? { ...item, state: "completed" } : item
        )
      )
      return
    }
    if (event.type === "run_completed") {
      if (event.message) {
        const message = {
          ...event.message,
          citations: event.message.citations ?? event.citations,
        }
        setMessages((current) => [
          ...current.filter((item) => item.id !== message.id),
          message,
        ])
      }
      setStreamedText("")
      return
    }
    if (event.type === "run_failed") setError(event.message)
  }

  async function send() {
    const prompt = draft.trim()
    if (!prompt || busy) return
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setBusy(true)
    setStartedAt(Date.now())
    setError(null)
    setStatus(null)
    setActivities([])
    setStreamedText("")

    let activeConversationId = conversationIdRef.current
    try {
      if (!activeConversationId) {
        const created = await aiTransport.createConversation(
          token,
          workspaceId,
          abort.signal
        )
        activeConversationId = created.id
        conversationIdRef.current = created.id
        setConversationId(created.id)
        setConversations((current) => sortConversations([created, ...current]))
      }

      const optimistic: AiMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: prompt,
        created_at: new Date().toISOString(),
      }
      setMessages((current) => [...current, optimistic])
      setDraft("")

      await aiTransport.streamMessage(
        token,
        workspaceId,
        activeConversationId,
        {
          prompt,
          action: {
            type: "workspace_agent",
            prompt,
            page_id: contextPageId,
            mentioned_page_ids: [],
            selection: [],
          },
        },
        handleEvent,
        abort.signal
      )

      const history = await aiTransport.getConversation(
        token,
        workspaceId,
        activeConversationId,
        abort.signal
      )
      if (!abort.signal.aborted) {
        setMessages(history.messages)
        await refreshConversations(abort.signal)
      }
    } catch (caught) {
      if (isAbortError(caught)) {
        setStatus(
          "Exibicao interrompida. A execucao pode continuar no servidor."
        )
      } else {
        setError(
          caught instanceof Error ? caught.message : "A resposta falhou."
        )
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      setBusy(false)
      setStartedAt(null)
      setActivities([])
      setStreamedText("")
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return {
    activities,
    busy,
    conversations,
    conversationId,
    draft,
    error,
    loading,
    messages,
    startedAt,
    status,
    streamedText,
    newConversation,
    selectConversation,
    send,
    setDraft,
    stop,
  }
}
