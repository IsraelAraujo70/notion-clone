"use client"

import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { startTransition, useEffect, useState } from "react"

import type { DiffViewMode } from "@/components/code-review/molecules/review-toolbar"
import { ReviewWorkspace } from "@/components/code-review/templates/review-workspace"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { api, type GitHubPullRequestLink } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { ReviewFile } from "@/lib/code-review/contracts"
import {
  toPullRequest,
  toReviewFile,
} from "@/lib/code-review/github-review-adapters"
import type { LineSelection } from "@/lib/code-review/line-selection"

interface ReviewLoadState {
  requestKey: string
  link: GitHubPullRequestLink | null
  files: ReviewFile[] | null
  error: string | null
  truncated: boolean
  totalChangedFiles: number
}

export function PullRequestReviewPage() {
  const params = useParams<{ pageId?: string | string[] }>()
  const pageId = typeof params.pageId === "string" ? params.pageId : null
  const router = useRouter()
  const { token } = useAuth()
  const { activeWorkspaceId } = useWorkspace()
  const [loadState, setLoadState] = useState<ReviewLoadState | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DiffViewMode>("split")
  const [selection, setSelection] = useState<LineSelection | null>(null)
  const [retry, setRetry] = useState(0)
  const requestKey =
    token && activeWorkspaceId && pageId
      ? `${activeWorkspaceId}:${pageId}:${retry}`
      : null
  const currentLoad = loadState?.requestKey === requestKey ? loadState : null

  useEffect(() => {
    if (!token || !activeWorkspaceId || !pageId || !requestKey) return
    const controller = new AbortController()

    void (async () => {
      const pullRequest = await api.getGitHubPullRequest(
        token,
        activeWorkspaceId,
        pageId
      )
      if (!pullRequest) {
        throw new Error("No pull request is linked to this page.")
      }
      const response = await api.listGitHubPullRequestFiles(
        token,
        activeWorkspaceId,
        pageId,
        controller.signal
      )
      const nextFiles = response.files.map(toReviewFile)
      setLoadState({
        requestKey,
        link: pullRequest,
        files: nextFiles,
        error: null,
        truncated: response.truncated,
        totalChangedFiles: response.total_changed_files,
      })
      setActivePath(nextFiles[0]?.path ?? null)
    })().catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setLoadState({
        requestKey,
        link: null,
        files: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Could not load the pull request review.",
        truncated: false,
        totalChangedFiles: 0,
      })
    })

    return () => controller.abort()
  }, [activeWorkspaceId, pageId, requestKey, token])

  const backToPage = () => {
    if (pageId) router.push(`/dashboard/pages/${pageId}`)
    else router.push("/dashboard")
  }

  if (currentLoad?.error) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6" role="alert">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <AlertCircleIcon className="size-8 text-destructive" />
          <div>
            <h1 className="font-semibold">Could not open code review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentLoad.error}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={backToPage}>
              Back to page
            </Button>
            <Button onClick={() => setRetry((value) => value + 1)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentLoad?.link || !currentLoad.files) {
    return (
      <div
        className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground"
        role="status"
      >
        <span className="flex items-center gap-2">
          <LoaderCircleIcon className="size-4 animate-spin" /> Loading code
          review
        </span>
      </div>
    )
  }

  const { files, link, totalChangedFiles, truncated } = currentLoad

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {truncated ? (
        <div
          role="alert"
          className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs"
        >
          Showing {files.length} of {totalChangedFiles} changed files. Review
          the remaining files on GitHub.
        </div>
      ) : null}
      <ReviewWorkspace
        className="min-h-0 flex-1"
        pullRequest={toPullRequest(link)}
        repositoryLabel={`${link.owner}/${link.repository}`}
        files={files}
        activePath={activePath}
        viewMode={viewMode}
        selection={selection}
        threads={[]}
        commentDraft=""
        allowComments={false}
        onBack={backToPage}
        onFileSelect={(path) => {
          setSelection(null)
          startTransition(() => setActivePath(path))
        }}
        onViewModeChange={setViewMode}
        onSelectionChange={setSelection}
        onCommentDraftChange={() => undefined}
        onSubmitComment={() => undefined}
      />
    </div>
  )
}
