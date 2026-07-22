"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  api,
  type GitHubInstallation,
  type GitHubPullRequestLink,
} from "@/lib/api"

interface IntegrationLoadState {
  requestKey: string
  configured: boolean
  installation: GitHubInstallation | null
  link: GitHubPullRequestLink | null
  error: boolean
}

export function usePageGitHubIntegration({
  token,
  workspaceId,
  blockId,
}: {
  token: string | null
  workspaceId: string | null
  blockId: string
}) {
  const [loadState, setLoadState] = useState<IntegrationLoadState | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestKey =
    token && workspaceId ? `${workspaceId}:${blockId}:${retry}` : null
  const currentLoad = loadState?.requestKey === requestKey ? loadState : null

  useEffect(() => {
    if (!token || !workspaceId || !requestKey) return
    let cancelled = false

    Promise.all([
      api.getGitHubIntegrationStatus(token, workspaceId),
      api.getGitHubPullRequest(token, workspaceId, blockId),
    ])
      .then(([status, pullRequestLink]) => {
        if (cancelled) return
        setLoadState({
          requestKey,
          configured: status.configured,
          installation: status.installations[0] ?? null,
          link: pullRequestLink,
          error: false,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({
            requestKey,
            configured: true,
            installation: null,
            link: null,
            error: true,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [blockId, requestKey, token, workspaceId])

  const reload = useCallback(() => setRetry((value) => value + 1), [])

  const connectGitHub = async () => {
    if (!token || !workspaceId) return false
    setBusy(true)
    try {
      const result = await api.beginGitHubInstallation(
        token,
        workspaceId,
        blockId
      )
      window.location.assign(result.installation_url)
      return true
    } catch {
      toast.error("Could not start the GitHub installation")
      setBusy(false)
      return false
    }
  }

  const linkPullRequest = async (url: string) => {
    if (!token || !workspaceId) return false
    setBusy(true)
    try {
      const next = await api.linkGitHubPullRequest(
        token,
        workspaceId,
        blockId,
        url
      )
      setLoadState((current) =>
        current?.requestKey === requestKey
          ? { ...current, link: next }
          : current
      )
      toast.success("Pull request linked")
      return true
    } catch {
      toast.error("Could not link this pull request")
      return false
    } finally {
      setBusy(false)
    }
  }

  const unlinkPullRequest = async () => {
    if (!token || !workspaceId) return false
    setBusy(true)
    try {
      await api.unlinkGitHubPullRequest(token, workspaceId, blockId)
      setLoadState((current) =>
        current?.requestKey === requestKey
          ? { ...current, link: null }
          : current
      )
      toast.success("Pull request unlinked")
      return true
    } catch {
      toast.error("Could not unlink this pull request")
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    installation: currentLoad?.installation ?? null,
    configured: currentLoad?.configured ?? true,
    link: currentLoad?.link ?? null,
    loading: requestKey !== null && !currentLoad,
    error: currentLoad?.error ?? false,
    busy,
    reload,
    connectGitHub,
    linkPullRequest,
    unlinkPullRequest,
  }
}

export type PageGitHubIntegration = ReturnType<typeof usePageGitHubIntegration>
