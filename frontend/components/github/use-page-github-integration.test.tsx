import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { usePageGitHubIntegration } from "./use-page-github-integration"

vi.mock("@/lib/api", () => ({
  api: {
    getGitHubIntegrationStatus: vi.fn(),
    getGitHubPullRequest: vi.fn(),
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

describe("usePageGitHubIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getGitHubIntegrationStatus).mockResolvedValue({
      configured: true,
      installations: [installation],
    })
    vi.mocked(api.getGitHubPullRequest).mockResolvedValue(link)
  })

  it("loads the workspace installation and page link together", async () => {
    const { result } = renderHook(() =>
      usePageGitHubIntegration({
        token: "token",
        workspaceId: "workspace-1",
        blockId: "page-1",
      })
    )

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.installation).toEqual(installation)
    expect(result.current.link).toEqual(link)
  })

  it("updates the local page link after unlinking", async () => {
    vi.mocked(api.unlinkGitHubPullRequest).mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      usePageGitHubIntegration({
        token: "token",
        workspaceId: "workspace-1",
        blockId: "page-1",
      })
    )
    await waitFor(() => expect(result.current.link).toEqual(link))

    await act(async () => {
      await result.current.unlinkPullRequest()
    })

    expect(result.current.link).toBeNull()
    expect(api.unlinkGitHubPullRequest).toHaveBeenCalledWith(
      "token",
      "workspace-1",
      "page-1"
    )
  })
})
