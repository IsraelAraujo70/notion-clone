import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { PullRequest, ReviewFile } from "@/lib/code-review/contracts"

import { ReviewWorkspace } from "./review-workspace"

vi.mock("@/lib/code-review/tree-sitter-highlight", () => ({
  useTreeSitterHighlight: () => () => [],
}))

const pullRequest: PullRequest = {
  id: "pr-1",
  number: 42,
  title: "Improve parser",
  body: null,
  state: "open",
  isDraft: false,
  author: { id: "user-1", login: "octocat" },
  base: { label: "main", ref: "main", sha: "base-sha" },
  head: { label: "feature", ref: "feature", sha: "head-sha" },
  additions: 1,
  deletions: 1,
  changedFiles: 2,
  createdAt: "2026-07-20T10:00:00Z",
  updatedAt: "2026-07-21T10:00:00Z",
}

const files: ReviewFile[] = [
  {
    path: "src/first.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch: "@@ -1 +1 @@\n-before\n+after",
  },
  {
    path: "src/second.ts",
    status: "added",
    additions: 1,
    deletions: 0,
    changes: 1,
    patch: "@@ -0,0 +1 @@\n+new",
  },
]

describe("ReviewWorkspace", () => {
  it("composes controlled file, layout, and line selection callbacks", () => {
    const onFileSelect = vi.fn()
    const onViewModeChange = vi.fn()
    const onSelectionChange = vi.fn()
    render(
      <ReviewWorkspace
        pullRequest={pullRequest}
        files={files}
        activePath="src/first.ts"
        viewMode="unified"
        selection={null}
        threads={[]}
        commentDraft=""
        onFileSelect={onFileSelect}
        onViewModeChange={onViewModeChange}
        onSelectionChange={onSelectionChange}
        onCommentDraftChange={vi.fn()}
        onSubmitComment={vi.fn()}
      />
    )

    expect(
      screen.getByRole("heading", { name: "Improve parser" })
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole("treeitem", {
        name: "src/second.ts, added, 1 additions, 0 deletions",
      })
    )
    expect(onSelectionChange).toHaveBeenCalledWith(null)
    expect(onFileSelect).toHaveBeenCalledWith("src/second.ts")

    fireEvent.click(screen.getByRole("radio", { name: "Split" }))
    expect(onViewModeChange).toHaveBeenCalledWith("split")

    fireEvent.click(screen.getByRole("button", { name: "Select right line 1" }))
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      anchor: {
        path: "src/first.ts",
        hunkId: "hunk-0",
        side: "RIGHT",
        line: 1,
      },
      focus: {
        path: "src/first.ts",
        hunkId: "hunk-0",
        side: "RIGHT",
        line: 1,
      },
    })
  })

  it("submits the selected range and trimmed controlled draft", () => {
    const onSubmitComment = vi.fn()
    render(
      <ReviewWorkspace
        pullRequest={pullRequest}
        files={files}
        activePath="src/first.ts"
        viewMode="unified"
        selection={{
          anchor: {
            path: "src/first.ts",
            hunkId: "hunk-0",
            side: "RIGHT",
            line: 1,
          },
          focus: {
            path: "src/first.ts",
            hunkId: "hunk-0",
            side: "RIGHT",
            line: 1,
          },
        }}
        threads={[]}
        commentDraft="  Looks good  "
        onFileSelect={vi.fn()}
        onViewModeChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onCommentDraftChange={vi.fn()}
        onSubmitComment={onSubmitComment}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))
    expect(onSubmitComment).toHaveBeenCalledWith(
      { path: "src/first.ts", side: "RIGHT", startLine: 1, endLine: 1 },
      "Looks good"
    )
  })
})
