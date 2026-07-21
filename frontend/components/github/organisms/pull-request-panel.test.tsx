import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { PullRequestPanel } from "./pull-request-panel"

vi.mock("@/lib/api", () => ({
  api: {
    getGitHubIntegrationStatus: vi.fn(),
    getGitHubPullRequest: vi.fn(),
    listGitHubPullRequestFiles: vi.fn(),
    beginGitHubInstallation: vi.fn(),
    linkGitHubPullRequest: vi.fn(),
    unlinkGitHubPullRequest: vi.fn(),
  },
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const installation = {
  id: "installation-1",
  workspace_id: "workspace-1",
  installation_id: 42,
  account_login: "acme",
  account_type: "Organization",
  created_at: "2026-07-21T10:00:00Z",
  updated_at: "2026-07-21T10:00:00Z",
}

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
  changed_files: 1,
  created_at: "2026-07-21T10:00:00Z",
  updated_at: "2026-07-21T10:00:00Z",
}

describe("PullRequestPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("offers GitHub installation only to a workspace owner", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: true,
      installations: [],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(null)

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="owner"
        canWrite
      />
    )

    expect(
      await screen.findByRole("button", { name: "Connect GitHub" })
    ).toBeVisible()
  })

  it("loads a linked pull request and its real changed files", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: true,
      installations: [installation],
    })
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
      total_changed_files: 1,
      truncated: false,
    })

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="editor"
        canWrite
      />
    )

    fireEvent.click(await screen.findByRole("button", { name: "Review code" }))

    expect(
      await screen.findByRole("heading", {
        name: "Connect plans to pull requests",
      })
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "src/app.ts, modified, 1 additions, 1 deletions",
      })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Select right line 1" })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.listGitHubPullRequestFiles).toHaveBeenCalledWith(
        "token",
        "workspace-1",
        "page-1",
        expect.any(AbortSignal)
      )
    )
  })

  it("does not offer installation when GitHub is not configured", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: false,
      installations: [],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(null)

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="owner"
        canWrite
      />
    )

    expect(
      await screen.findByText("GitHub integration unavailable")
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Connect GitHub" })
    ).not.toBeInTheDocument()
  })

  it("disables an existing installation when server credentials are missing", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: false,
      installations: [installation],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(link)

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="owner"
        canWrite
      />
    )

    expect(
      await screen.findByText("GitHub integration unavailable")
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Review code" })
    ).not.toBeInTheDocument()
  })

  it("shows when the changed file list is truncated", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: true,
      installations: [installation],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue({
      ...link,
      changed_files: 501,
    })
    vi.mocked(api.listGitHubPullRequestFiles).mockResolvedValue({
      files: [
        {
          path: "src/app.ts",
          previous_filename: null,
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -0,0 +1 @@\n+after",
          blob_url: "https://github.com/acme/reason/blob/head/src/app.ts",
        },
      ],
      total_changed_files: 501,
      truncated: true,
    })

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="editor"
        canWrite
      />
    )
    fireEvent.click(await screen.findByRole("button", { name: "Review code" }))

    expect(
      await screen.findByText(/Showing 1 of 501 changed files/)
    ).toBeVisible()
  })

  it("renders merged pull requests distinctly", async () => {
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: true,
      installations: [installation],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue({
      ...link,
      state: "merged",
    })

    render(
      <PullRequestPanel
        token="token"
        workspaceId="workspace-1"
        blockId="page-1"
        workspaceRole="viewer"
        canWrite={false}
      />
    )

    expect(await screen.findByText("merged")).toBeVisible()
  })
})
