"use client"

import {
  Code2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LoaderCircleIcon,
  UnlinkIcon,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import type { DiffViewMode } from "@/components/code-review/molecules/review-toolbar"
import { ReviewWorkspace } from "@/components/code-review/templates/review-workspace"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { PullRequest, ReviewFile } from "@/lib/code-review/contracts"
import type { LineSelection } from "@/lib/code-review/line-selection"
import {
  api,
  type GitHubInstallation,
  type GitHubPullRequestFile,
  type GitHubPullRequestLink,
  type WorkspaceRole,
} from "@/lib/api"

interface PullRequestPanelProps {
  token: string
  workspaceId: string
  blockId: string
  workspaceRole: WorkspaceRole
  canWrite: boolean
}

export function PullRequestPanel({
  token,
  workspaceId,
  blockId,
  workspaceRole,
  canWrite,
}: PullRequestPanelProps) {
  const [installation, setInstallation] = useState<GitHubInstallation | null>(
    null
  )
  const [githubConfigured, setGitHubConfigured] = useState(true)
  const [link, setLink] = useState<GitHubPullRequestLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [overviewError, setOverviewError] = useState(false)
  const [overviewRetry, setOverviewRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pullRequestUrl, setPullRequestUrl] = useState("")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [files, setFiles] = useState<ReviewFile[] | null>(null)
  const [filesTruncated, setFilesTruncated] = useState(false)
  const [totalChangedFiles, setTotalChangedFiles] = useState(0)
  const [filesError, setFilesError] = useState(false)
  const [filesRetry, setFilesRetry] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified")
  const [selection, setSelection] = useState<LineSelection | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.getGitHubIntegrationStatus(token, workspaceId),
      api.getGitHubPullRequest(token, workspaceId, blockId),
    ])
      .then(([status, pullRequestLink]) => {
        if (cancelled) return
        setOverviewError(false)
        setGitHubConfigured(status.configured)
        setInstallation(status.installations[0] ?? null)
        setLink(pullRequestLink)
      })
      .catch(() => {
        if (!cancelled) {
          setOverviewError(true)
          toast.error("Could not load the GitHub integration")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [blockId, overviewRetry, token, workspaceId])

  useEffect(() => {
    if (!reviewOpen || !link || files) return
    const controller = new AbortController()
    void api
      .listGitHubPullRequestFiles(
        token,
        workspaceId,
        blockId,
        controller.signal
      )
      .then((response) => {
        const next = response.files.map(toReviewFile)
        setFiles(next)
        setFilesTruncated(response.truncated)
        setTotalChangedFiles(response.total_changed_files)
        setActivePath(next[0]?.path ?? null)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setFilesError(true)
        toast.error("Could not load the pull request files")
      })
    return () => controller.abort()
  }, [blockId, files, filesRetry, link, reviewOpen, token, workspaceId])

  const connectGitHub = async () => {
    setBusy(true)
    try {
      const result = await api.beginGitHubInstallation(
        token,
        workspaceId,
        blockId
      )
      window.location.assign(result.installation_url)
    } catch {
      toast.error("Could not start the GitHub installation")
      setBusy(false)
    }
  }

  const linkPullRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = pullRequestUrl.trim()
    if (!url) return
    setBusy(true)
    try {
      const next = await api.linkGitHubPullRequest(
        token,
        workspaceId,
        blockId,
        url
      )
      setLink(next)
      setPullRequestUrl("")
      setFiles(null)
      toast.success("Pull request linked")
    } catch {
      toast.error("Could not link this pull request")
    } finally {
      setBusy(false)
    }
  }

  const unlinkPullRequest = async () => {
    setBusy(true)
    try {
      await api.unlinkGitHubPullRequest(token, workspaceId, blockId)
      setLink(null)
      setFiles(null)
      setReviewOpen(false)
      toast.success("Pull request unlinked")
    } catch {
      toast.error("Could not unlink this pull request")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="mb-6 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"
      >
        <LoaderCircleIcon className="size-4 animate-spin" />
        Loading GitHub integration
      </div>
    )
  }

  if (overviewError) {
    return (
      <div
        role="alert"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
      >
        <span>Could not load the GitHub integration.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOverviewError(false)
            setLoading(true)
            setOverviewRetry((value) => value + 1)
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (!githubConfigured) {
    if (workspaceRole !== "owner") return null
    return (
      <div className="mb-6 rounded-xl border bg-muted/20 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <GitBranchIcon className="size-4" /> GitHub integration unavailable
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure the GitHub App credentials on the Reason server first.
        </p>
      </div>
    )
  }

  if (!installation) {
    if (workspaceRole !== "owner") return null
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <GitBranchIcon className="size-4" /> Connect this workspace to
            GitHub
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Install the Reason GitHub App to link plans and pull requests.
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={connectGitHub}>
          {busy ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <GitBranchIcon />
          )}
          Connect GitHub
        </Button>
      </div>
    )
  }

  if (!link) {
    if (!canWrite) return null
    return (
      <form
        className="mb-6 rounded-xl border bg-muted/20 p-4"
        onSubmit={linkPullRequest}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <GitPullRequestIcon className="size-4" /> Link a pull request
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {installation.account_login}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            required
            value={pullRequestUrl}
            placeholder="https://github.com/owner/repository/pull/123"
            aria-label="GitHub pull request URL"
            disabled={busy}
            onChange={(event) => setPullRequestUrl(event.currentTarget.value)}
          />
          <Button type="submit" disabled={busy || !pullRequestUrl.trim()}>
            {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
            Link PR
          </Button>
        </div>
      </form>
    )
  }

  const pullRequest = toPullRequest(link)

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <GitPullRequestIcon className="size-4 text-emerald-600" />
              <span>
                {link.owner}/{link.repository}#{link.pull_number}
              </span>
              <span className="rounded-full border px-2 py-0.5 capitalize">
                {link.draft ? "draft" : link.state}
              </span>
              <span>
                <span className="text-emerald-600">+{link.additions}</span>{" "}
                <span className="text-red-600">-{link.deletions}</span>
              </span>
            </div>
            <h2
              className="mt-1 truncate text-sm font-semibold"
              title={link.title}
            >
              {link.title}
            </h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {link.base_ref} {"<-"} {link.head_ref} · {link.changed_files}{" "}
              changed files
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReviewOpen(true)}
            >
              <Code2Icon /> Review code
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={link.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon /> GitHub
              </a>
            </Button>
            {canWrite ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Unlink pull request"
                disabled={busy}
                onClick={unlinkPullRequest}
              >
                <UnlinkIcon />
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="h-[92vh] max-w-[calc(100vw-1rem)] overflow-auto p-2 sm:max-w-[min(96vw,1500px)] sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Review pull request {link.pull_number}</DialogTitle>
            <DialogDescription>
              Read-only code review. Inline review submission will be enabled
              after GitHub write authorization is configured.
            </DialogDescription>
          </DialogHeader>
          {files ? (
            <div className="flex min-h-0 flex-col gap-2">
              {filesTruncated ? (
                <div
                  role="alert"
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
                >
                  Showing {files.length} of {totalChangedFiles} changed files.
                  Review the remaining files on GitHub.
                </div>
              ) : null}
              <ReviewWorkspace
                pullRequest={pullRequest}
                files={files}
                activePath={activePath}
                viewMode={viewMode}
                selection={selection}
                threads={[]}
                commentDraft=""
                allowComments={false}
                onFileSelect={setActivePath}
                onViewModeChange={setViewMode}
                onSelectionChange={setSelection}
                onCommentDraftChange={() => undefined}
                onSubmitComment={() => undefined}
              />
            </div>
          ) : filesError ? (
            <div
              role="alert"
              className="grid min-h-72 place-items-center text-sm text-muted-foreground"
            >
              <div className="flex flex-col items-center gap-3">
                <span>Could not load the changed files.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilesError(false)
                    setFilesRetry((value) => value + 1)
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <div
              role="status"
              className="grid min-h-72 place-items-center text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <LoaderCircleIcon className="size-4 animate-spin" /> Loading
                changed files
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function toPullRequest(link: GitHubPullRequestLink): PullRequest {
  const author = link.author_login ?? "ghost"
  return {
    id: link.id,
    number: link.pull_number,
    title: link.title,
    body: link.body,
    state:
      link.state === "open" ||
      link.state === "closed" ||
      link.state === "merged"
        ? link.state
        : "closed",
    isDraft: link.draft,
    author: { id: author, login: author },
    base: { label: link.base_ref, ref: link.base_ref, sha: "" },
    head: { label: link.head_ref, ref: link.head_ref, sha: link.head_sha },
    additions: link.additions,
    deletions: link.deletions,
    changedFiles: link.changed_files,
    createdAt: link.created_at,
    updatedAt: link.updated_at,
    url: link.url,
  }
}

function toReviewFile(file: GitHubPullRequestFile): ReviewFile {
  const statuses: ReviewFile["status"][] = [
    "added",
    "modified",
    "removed",
    "renamed",
    "copied",
    "changed",
  ]
  return {
    path: file.path,
    previousPath: file.previous_filename ?? undefined,
    status: statuses.includes(file.status as ReviewFile["status"])
      ? (file.status as ReviewFile["status"])
      : "changed",
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  }
}
