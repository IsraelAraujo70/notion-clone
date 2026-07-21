"use client"

import { CommentEditor } from "@/components/code-review/molecules/comment-editor"
import {
  ReviewToolbar,
  type DiffViewMode,
} from "@/components/code-review/molecules/review-toolbar"
import { DiffViewer } from "@/components/code-review/organisms/diff-viewer"
import { FileNavigator } from "@/components/code-review/organisms/file-navigator"
import type {
  PullRequest,
  ReviewFile,
  ReviewThread,
} from "@/lib/code-review/contracts"
import {
  toReviewLineRange,
  updateLineSelection,
  type LineSelection,
  type ReviewLineRange,
} from "@/lib/code-review/line-selection"
import { parseUnifiedPatch } from "@/lib/code-review/parse-unified-patch"
import { useCallback, useMemo } from "react"

interface ReviewWorkspaceProps {
  pullRequest: PullRequest
  files: ReviewFile[]
  activePath: string | null
  viewMode: DiffViewMode
  selection: LineSelection | null
  threads: ReviewThread[]
  commentDraft: string
  submittingComment?: boolean
  allowComments?: boolean
  onFileSelect: (path: string) => void
  onViewModeChange: (mode: DiffViewMode) => void
  onSelectionChange: (selection: LineSelection | null) => void
  onCommentDraftChange: (value: string) => void
  onSubmitComment: (selection: ReviewLineRange, body: string) => void
}

export function ReviewWorkspace({
  pullRequest,
  files,
  activePath,
  viewMode,
  selection,
  threads,
  commentDraft,
  submittingComment = false,
  allowComments = true,
  onFileSelect,
  onViewModeChange,
  onSelectionChange,
  onCommentDraftChange,
  onSubmitComment,
}: ReviewWorkspaceProps) {
  const activeIndex = files.findIndex((file) => file.path === activePath)
  const activeFile = activeIndex >= 0 ? files[activeIndex]! : null
  const range = selection ? toReviewLineRange(selection) : null
  const parsedPatch = useMemo(
    () =>
      parseUnifiedPatch(activeFile?.patch, {
        isBinary: activeFile?.isBinary,
      }),
    [activeFile?.isBinary, activeFile?.patch]
  )
  const activeThreads = useMemo(
    () => threads.filter((thread) => thread.path === activeFile?.path),
    [activeFile?.path, threads]
  )
  const selectLine = useCallback(
    (address: Parameters<typeof updateLineSelection>[1], extend: boolean) =>
      onSelectionChange(updateLineSelection(selection, address, extend)),
    [onSelectionChange, selection]
  )

  const selectFile = (path: string) => {
    onSelectionChange(null)
    onFileSelect(path)
  }

  return (
    <section
      className="overflow-hidden rounded-xl border bg-background shadow-sm"
      aria-label={`Code review for pull request ${pullRequest.number}`}
    >
      <header className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5 capitalize">
            {pullRequest.state}
          </span>
          <span>#{pullRequest.number}</span>
          <span>{pullRequest.author.login}</span>
        </div>
        <h1 className="mt-1 text-lg font-semibold sm:text-xl">
          {pullRequest.title}
        </h1>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {pullRequest.base.ref} {"<-"} {pullRequest.head.ref}
        </p>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <FileNavigator
          files={files}
          activePath={activeFile?.path ?? null}
          onSelectFile={selectFile}
        />
        <main className="min-w-0">
          {activeFile ? (
            <>
              <ReviewToolbar
                filePath={activeFile.path}
                additions={activeFile.additions}
                deletions={activeFile.deletions}
                viewMode={viewMode}
                hasPreviousFile={activeIndex > 0}
                hasNextFile={activeIndex < files.length - 1}
                onPreviousFile={() => selectFile(files[activeIndex - 1]!.path)}
                onNextFile={() => selectFile(files[activeIndex + 1]!.path)}
                onViewModeChange={onViewModeChange}
              />
              <div className="overflow-x-auto">
                <DiffViewer
                  path={activeFile.path}
                  patch={parsedPatch}
                  viewMode={viewMode}
                  selection={selection}
                  threads={activeThreads}
                  selectable={allowComments}
                  onSelectLine={selectLine}
                />
              </div>
              {allowComments && range && range.path === activeFile.path && (
                <CommentEditor
                  selection={range}
                  value={commentDraft}
                  submitting={submittingComment}
                  onChange={onCommentDraftChange}
                  onCancel={() => onSelectionChange(null)}
                  onSubmit={() => onSubmitComment(range, commentDraft.trim())}
                />
              )}
            </>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {files.length === 0
                ? "No changed files."
                : "Select a file to review."}
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
