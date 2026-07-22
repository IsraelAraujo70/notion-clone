import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { PullRequestReviewPage } from "./pull-request-review-page"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ pageId: "page-1" }),
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ token: "token" }),
}))

vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspace: () => ({ activeWorkspaceId: "workspace-1" }),
}))

vi.mock("@/lib/api", () => ({
  api: {
    getGitHubPullRequest: vi.fn(),
    listGitHubPullRequestFiles: vi.fn(),
  },
}))

vi.mock("@/lib/code-review/tree-sitter-highlight", () => ({
  useTreeSitterHighlight: () => () => [],
}))

const link = {
  id: "link-1",
  workspace_id: "workspace-1",
  block_id: "page-1",
  owner: "acme",
  repository: "reason",
  pull_number: 42,
  url: "https://github.com/acme/reason/pull/42",
  title: "Connect plans to pull requests",
  body: null,
  state: "open",
  draft: false,
  author_login: "octocat",
  head_sha: "head-sha",
  base_ref: "main",
  head_ref: "feature/github",
  additions: 3,
  deletions: 1,
  changed_files: 501,
  created_at: "2026-07-21T10:00:00Z",
  updated_at: "2026-07-21T10:00:00Z",
}

describe("PullRequestReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the linked pull request into the dedicated review workspace", async () => {
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(link)
    vi.mocked(api.listGitHubPullRequestFiles).mockResolvedValue({
      files: [
        {
          path: "src/app.ts",
          previous_filename: null,
          status: "modified",
          additions: 1,
          deletions: 1,
          changes: 2,
          patch: "@@ -1 +1 @@\n-before\n+after",
          blob_url: "https://github.com/acme/reason/blob/head/src/app.ts",
        },
      ],
      total_changed_files: 501,
      truncated: true,
    })

    render(<PullRequestReviewPage />)

    expect(
      await screen.findByRole("heading", {
        name: "Connect plans to pull requests",
      })
    ).toBeVisible()
    expect(
      screen.getByRole("treeitem", {
        name: "src/app.ts, modified, 1 additions, 1 deletions",
      })
    ).toBeVisible()
    expect(screen.getByText(/Showing 1 of 501 changed files/)).toBeVisible()
    await waitFor(() =>
      expect(api.listGitHubPullRequestFiles).toHaveBeenCalledWith(
        "token",
        "workspace-1",
        "page-1",
        expect.any(AbortSignal)
      )
    )
  })

  it("shows a recoverable error when the page has no linked pull request", async () => {
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(null)

    render(<PullRequestReviewPage />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pull request is linked to this page."
    )
    expect(api.listGitHubPullRequestFiles).not.toHaveBeenCalled()
  })
})
