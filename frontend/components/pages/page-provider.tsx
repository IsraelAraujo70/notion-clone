"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { api, type PageSummary, type TrashEntry } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Operation } from "@/lib/contracts"
import { newBlock } from "@/lib/engine/tree"
import { createId } from "@/lib/id"

type PageContextValue = {
  pages: PageSummary[]
  rootPageId: string | null
  currentPageId: string | null
  loading: boolean
  canWrite: boolean
  refreshPages: () => Promise<void>
  createChildPage: (parentPageId: string) => Promise<string>
  trash: TrashEntry[]
  refreshTrash: () => Promise<void>
  restore: (blockId: string) => Promise<void>
  /** Muda quando a página aberta pode ter mudado fora do editor (ex.: restore). */
  pageRevision: number
}

const PageContext = createContext<PageContextValue | null>(null)

export function pagePath(pageId: string) {
  return `/dashboard/pages/${pageId}`
}

export function PageProvider({
  pageId,
  children,
}: {
  pageId?: string
  children: ReactNode
}) {
  const router = useRouter()
  const { token } = useAuth()
  const { activeWorkspace, activeWorkspaceId, loading: workspaceLoading } =
    useWorkspace()
  const [pages, setPages] = useState<PageSummary[]>([])
  const [rootPageId, setRootPageId] = useState<string | null>(null)
  const [trash, setTrash] = useState<TrashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pageRevision, setPageRevision] = useState(0)

  const canWrite = activeWorkspace?.role !== "viewer"

  const loadPages = useCallback(async () => {
    if (!token || !activeWorkspaceId) return
    const response = await api.listPages(token, activeWorkspaceId)
    setPages(response.pages)
    setRootPageId(response.root_page_id)
    return response
  }, [activeWorkspaceId, token])

  useEffect(() => {
    if (workspaceLoading || !token || !activeWorkspaceId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setPages([])
      setRootPageId(null)
      void api
        .listPages(token, activeWorkspaceId)
        .then((response) => {
          if (cancelled) return
          setPages(response.pages)
          setRootPageId(response.root_page_id)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, token, workspaceLoading])

  // `/dashboard` sem página, ou uma página de outro workspace (troca de workspace,
  // página no lixo): a raiz é sempre o destino canônico.
  useEffect(() => {
    if (loading || !rootPageId) return
    if (!pageId || !pages.some((page) => page.id === pageId)) {
      router.replace(pagePath(rootPageId))
    }
  }, [loading, pageId, pages, rootPageId, router])

  const refreshTrash = useCallback(async () => {
    if (!token || !activeWorkspaceId) return
    setTrash(await api.listTrash(token, activeWorkspaceId))
  }, [activeWorkspaceId, token])

  const createChildPage = useCallback(
    async (parentPageId: string) => {
      if (!token || !activeWorkspaceId) throw new Error("No active workspace")
      // Uma página nova é dois blocos: a página e seu primeiro parágrafo vazio.
      const page = newBlock("page", { title: "" }, createId(), activeWorkspaceId)
      const paragraph = newBlock(
        "paragraph",
        { text: "" },
        createId(),
        activeWorkspaceId
      )
      const ops: Operation[] = [
        {
          type: "insert_block",
          opId: createId(),
          block: page,
          parentId: parentPageId,
          index: Number.MAX_SAFE_INTEGER,
        },
        {
          type: "insert_block",
          opId: createId(),
          block: paragraph,
          parentId: page.id,
          index: 0,
        },
      ]
      for (const op of ops) {
        await api.applyOperation(token, activeWorkspaceId, op)
      }
      await loadPages()
      return page.id
    },
    [activeWorkspaceId, loadPages, token]
  )

  const restore = useCallback(
    async (blockId: string) => {
      if (!token || !activeWorkspaceId) return
      await api.applyOperation(token, activeWorkspaceId, {
        type: "restore_block",
        opId: createId(),
        blockId,
      })
      await Promise.all([loadPages(), refreshTrash()])
      setPageRevision((revision) => revision + 1)
    },
    [activeWorkspaceId, loadPages, refreshTrash, token]
  )

  const value = useMemo<PageContextValue>(
    () => ({
      pages,
      rootPageId,
      // Só depois de confirmar que a página existe neste workspace: evita montar
      // o editor numa página que o redirect acima vai trocar.
      currentPageId:
        pageId && pages.some((page) => page.id === pageId) ? pageId : null,
      loading: loading || workspaceLoading,
      canWrite,
      refreshPages: async () => {
        await loadPages()
      },
      createChildPage,
      trash,
      refreshTrash,
      restore,
      pageRevision,
    }),
    [
      canWrite,
      createChildPage,
      loadPages,
      loading,
      pageId,
      pageRevision,
      pages,
      refreshTrash,
      restore,
      rootPageId,
      trash,
      workspaceLoading,
    ]
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}

export function usePages(): PageContextValue {
  const context = useContext(PageContext)
  if (!context) {
    throw new Error("usePages must be used inside PageProvider")
  }
  return context
}
