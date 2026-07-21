"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"

import { useIsMobile } from "@/hooks/use-mobile"
import { DASHBOARD_AI_PATH } from "@/lib/dashboard-tabs"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  api,
  type PageSummary,
  type PermanentDeleteResponse,
  type TrashEntry,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Operation } from "@reason/core/contracts"
import { newBlock } from "@reason/core/engine/tree"
import { createId } from "@reason/core/id"

export const PAGE_DRAG_MIME = "application/x-reason-page+json"

export type PageDrag = Pick<PageSummary, "id" | "title" | "icon">

type PageContextValue = {
  pages: PageSummary[]
  /** Container invisível do workspace: pai das páginas de topo, nunca navegável. */
  containerPageId: string | null
  currentPageId: string | null
  loading: boolean
  canWrite: boolean
  refreshPages: () => Promise<void>
  createChildPage: (parentPageId: string) => Promise<string>
  /** Cria uma página de topo (irmã das demais), não filha de outra página. */
  createTopLevelPage: () => Promise<string>
  renamePage: (pageId: string, title: string) => Promise<void>
  setPageIcon: (pageId: string, icon: string | null) => Promise<void>
  /** Manda a página (e a subárvore dela) para a lixeira. A raiz não pode ir. */
  deletePage: (pageId: string) => Promise<void>
  /** Transfere a página e todos os descendentes para a raiz de outro workspace. */
  movePageToWorkspace: (
    pageId: string,
    destinationWorkspaceId: string
  ) => Promise<void>
  movePageWithinWorkspace: (
    pageId: string,
    newParentId: string,
    index: number
  ) => Promise<void>
  pageDrag: PageDrag | null
  startPageDrag: (page: PageDrag) => void
  endPageDrag: () => void
  trash: TrashEntry[]
  refreshTrash: () => Promise<void>
  restore: (blockId: string) => Promise<void>
  permanentDelete: (blockId: string) => Promise<PermanentDeleteResponse>
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
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { loading: authLoading, token } = useAuth()
  const {
    activeWorkspace,
    activeWorkspaceId,
    loading: workspaceLoading,
  } = useWorkspace()
  const [pages, setPages] = useState<PageSummary[]>([])
  const [validatedPageId, setValidatedPageId] = useState<string | null>(null)
  const [containerPageId, setContainerPageId] = useState<string | null>(null)
  const [trash, setTrash] = useState<TrashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pageRevision, setPageRevision] = useState(0)
  const [pageDrag, setPageDrag] = useState<PageDrag | null>(null)
  const pendingTransfers = useRef(new Map<string, string>())

  const canWrite = Boolean(
    token &&
    !authLoading &&
    activeWorkspace &&
    activeWorkspace.role !== "viewer"
  )

  const loadPages = useCallback(async () => {
    if (!token || !activeWorkspaceId) return
    const response = await api.listPages(token, activeWorkspaceId)
    setPages(response.pages)
    setContainerPageId(response.root_page_id)
    return response
  }, [activeWorkspaceId, token])

  useEffect(() => {
    if (authLoading || workspaceLoading || !token || !activeWorkspaceId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setPages([])
      setValidatedPageId(null)
      setContainerPageId(null)
      void api
        .listPages(token, activeWorkspaceId)
        .then((response) => {
          if (cancelled) return
          setPages(response.pages)
          setContainerPageId(response.root_page_id)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, authLoading, token, workspaceLoading])

  // Database rows são navegáveis, mas não aparecem na lista da sidebar. Valide
  // ids ausentes da lista antes de tratá-los como rota inválida.
  useEffect(() => {
    if (loading) return
    if (!pageId) {
      if (pathname === DASHBOARD_AI_PATH && !isMobile) return
      if (isMobile && pages[0]) router.replace(pagePath(pages[0].id))
      return
    }
    if (pages.some((page) => page.id === pageId)) {
      return
    }
    if (!token || !activeWorkspaceId) return

    let cancelled = false
    void api
      .getPage(token, activeWorkspaceId, pageId)
      .then(() => {
        if (!cancelled) setValidatedPageId(pageId)
      })
      .catch(() => {
        if (cancelled) return
        const fallback =
          isMobile && pages[0] ? pagePath(pages[0].id) : DASHBOARD_AI_PATH
        router.replace(fallback)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeWorkspaceId,
    isMobile,
    loading,
    pageId,
    pages,
    pathname,
    router,
    token,
  ])

  const refreshTrash = useCallback(async () => {
    if (!token || !activeWorkspaceId) return
    setTrash(await api.listTrash(token, activeWorkspaceId))
  }, [activeWorkspaceId, token])

  const createChildPage = useCallback(
    async (parentPageId: string) => {
      if (!token || !activeWorkspaceId) throw new Error("No active workspace")
      // Uma página nova é dois blocos: a página e seu primeiro parágrafo vazio.
      const page = newBlock(
        "page",
        { title: "" },
        createId(),
        activeWorkspaceId
      )
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

  // Rename/ícone/delete pelo menu de contexto: a página alvo pode ser a que está
  // aberta, então bumpamos `pageRevision` para o editor recarregar do servidor.
  const patchPage = useCallback(
    async (pageId: string, properties: Record<string, string | null>) => {
      if (!token || !activeWorkspaceId) return
      await api.applyOperation(token, activeWorkspaceId, {
        type: "update_block",
        opId: createId(),
        blockId: pageId,
        properties,
      })
      await loadPages()
      setPageRevision((revision) => revision + 1)
    },
    [activeWorkspaceId, loadPages, token]
  )

  const renamePage = useCallback(
    (pageId: string, title: string) => patchPage(pageId, { title }),
    [patchPage]
  )

  const setPageIcon = useCallback(
    (pageId: string, icon: string | null) => patchPage(pageId, { icon }),
    [patchPage]
  )

  const deletePage = useCallback(
    async (pageId: string) => {
      if (!token || !activeWorkspaceId) return
      await api.applyOperation(token, activeWorkspaceId, {
        type: "delete_block",
        opId: createId(),
        blockId: pageId,
      })
      await loadPages()
      setPageRevision((revision) => revision + 1)
    },
    [activeWorkspaceId, loadPages, token]
  )

  const movePageToWorkspace = useCallback(
    async (pageId: string, destinationWorkspaceId: string) => {
      if (!token || !activeWorkspaceId) return
      const key = `${activeWorkspaceId}:${pageId}:${destinationWorkspaceId}`
      const transferId = pendingTransfers.current.get(key) ?? createId()
      pendingTransfers.current.set(key, transferId)
      await api.transferPage(
        token,
        activeWorkspaceId,
        pageId,
        destinationWorkspaceId,
        transferId
      )
      pendingTransfers.current.delete(key)
      // A transferência já confirmou commit; falha no refresh não deve induzir
      // uma segunda tentativa com uma nova intenção de movimento.
      await loadPages().catch(() => undefined)
      setPageRevision((revision) => revision + 1)
    },
    [activeWorkspaceId, loadPages, token]
  )

  const movePageWithinWorkspace = useCallback(
    async (pageId: string, newParentId: string, index: number) => {
      if (!token || !activeWorkspaceId) throw new Error("No active workspace")
      await api.applyOperation(token, activeWorkspaceId, {
        type: "move_block",
        opId: createId(),
        blockId: pageId,
        newParentId,
        index,
      })
      // A operação já foi confirmada; uma falha de refresh não deve sugerir que
      // o usuário repita a intenção com outro opId.
      await loadPages().catch(() => undefined)
      setPageRevision((revision) => revision + 1)
    },
    [activeWorkspaceId, loadPages, token]
  )

  const createTopLevelPage = useCallback(async () => {
    if (!containerPageId) throw new Error("No workspace container")
    return createChildPage(containerPageId)
  }, [containerPageId, createChildPage])

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

  const permanentDelete = useCallback(
    async (blockId: string) => {
      if (!token || !activeWorkspaceId) throw new Error("No active workspace")
      const result = await api.permanentlyDelete(
        token,
        activeWorkspaceId,
        blockId
      )
      await Promise.all([loadPages(), refreshTrash()])
      setPageRevision((revision) => revision + 1)
      return result
    },
    [activeWorkspaceId, loadPages, refreshTrash, token]
  )

  const value = useMemo<PageContextValue>(
    () => ({
      pages,
      containerPageId,
      currentPageId:
        pageId &&
        (pageId === validatedPageId || pages.some((page) => page.id === pageId))
          ? pageId
          : null,
      loading: loading || authLoading || workspaceLoading,
      canWrite,
      refreshPages: async () => {
        await loadPages()
      },
      createChildPage,
      createTopLevelPage,
      renamePage,
      setPageIcon,
      deletePage,
      movePageToWorkspace,
      movePageWithinWorkspace,
      pageDrag,
      startPageDrag: setPageDrag,
      endPageDrag: () => setPageDrag(null),
      trash,
      refreshTrash,
      restore,
      permanentDelete,
      pageRevision,
    }),
    [
      canWrite,
      containerPageId,
      createChildPage,
      createTopLevelPage,
      deletePage,
      movePageWithinWorkspace,
      movePageToWorkspace,
      loadPages,
      loading,
      pageId,
      pageRevision,
      pageDrag,
      pages,
      validatedPageId,
      refreshTrash,
      renamePage,
      restore,
      permanentDelete,
      setPageIcon,
      trash,
      authLoading,
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
