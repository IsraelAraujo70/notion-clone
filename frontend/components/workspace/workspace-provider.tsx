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

import { api, type Workspace } from "@/lib/api"
import { useAuth } from "@/lib/auth"

type WorkspaceContextValue = {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  activeWorkspaceId: string | null
  loading: boolean
  selectWorkspace: (workspaceId: string) => void
  createWorkspace: (name: string) => Promise<Workspace>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function storageKey(userId: string) {
  return `reason_active_workspace:${userId}`
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(true)

  const persistActiveWorkspace = useCallback(
    (workspaceId: string) => {
      setActiveWorkspaceId(workspaceId)
      if (user) {
        window.localStorage.setItem(storageKey(user.id), workspaceId)
      }
    },
    [user]
  )

  const loadWorkspaces = useCallback(async () => {
    if (!token || !user) {
      setWorkspaces([])
      setActiveWorkspaceId(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextWorkspaces = await api.listWorkspaces(token)
      setWorkspaces(nextWorkspaces)
      const stored = window.localStorage.getItem(storageKey(user.id))
      const selected =
        nextWorkspaces.find((workspace) => workspace.id === stored) ??
        nextWorkspaces[0] ??
        null
      setActiveWorkspaceId(selected?.id ?? null)
      if (selected) {
        window.localStorage.setItem(storageKey(user.id), selected.id)
      }
    } finally {
      setLoading(false)
    }
  }, [token, user])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadWorkspaces()
      }
    })

    return () => {
      cancelled = true
    }
  }, [loadWorkspaces])

  const createWorkspace = useCallback(
    async (name: string) => {
      if (!token) {
        throw new Error("Missing session token")
      }

      const created = await api.createWorkspace(token, { name })
      const workspace: Workspace = { ...created, role: "owner" }
      setWorkspaces((current) => [...current, workspace])
      persistActiveWorkspace(workspace.id)
      return workspace
    },
    [persistActiveWorkspace, token]
  )

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!token) {
        throw new Error("Missing session token")
      }

      await api.deleteWorkspace(token, workspaceId)
      setWorkspaces((current) => {
        const next = current.filter((workspace) => workspace.id !== workspaceId)
        if (activeWorkspaceId === workspaceId) {
          const selected = next[0] ?? null
          setActiveWorkspaceId(selected?.id ?? null)
          if (user && selected) {
            window.localStorage.setItem(storageKey(user.id), selected.id)
          } else if (user) {
            window.localStorage.removeItem(storageKey(user.id))
          }
        }
        return next
      })
    },
    [activeWorkspaceId, token, user]
  )

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      null,
    [activeWorkspaceId, workspaces]
  )

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    loading,
    selectWorkspace: persistActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    refreshWorkspaces: loadWorkspaces,
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider")
  }
  return context
}
