import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Operation } from "@reason/core/contracts"
import { AUTH_UNAUTHORIZED_EVENT, ApiError, api, API_BASE_URL } from "./api"

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("posts signup and login requests", async () => {
    const response = {
      user: {
        id: "user-1",
        email: "israel@example.com",
        display_name: "Israel",
        created_at: "2026-07-07T12:00:00Z",
      },
      token: "secret-token",
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(201, response))
      .mockResolvedValueOnce(jsonResponse(200, response))

    await expect(
      api.signup({
        email: "israel@example.com",
        password: "Password123!",
        display_name: "Israel",
      })
    ).resolves.toEqual(response)
    await expect(
      api.login({ email: "israel@example.com", password: "Password123!" })
    ).resolves.toEqual(response)

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "israel@example.com",
        password: "Password123!",
        display_name: "Israel",
      }),
    })
    expect(fetch).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "israel@example.com",
        password: "Password123!",
      }),
    })
  })

  it("uses bearer auth for protected endpoints", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, { product: "reason", sections: [] })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await api.appSummary("secret-token")
    await api.logout("secret-token")

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/app/summary`, {
      method: "GET",
      headers: { Authorization: "Bearer secret-token" },
      body: undefined,
    })
    expect(fetch).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: "Bearer secret-token" },
      body: undefined,
    })
  })

  it("creates, lists and revokes MCP integration tokens", async () => {
    const integration = {
      id: "integration-1",
      name: "OpenCode",
      scopes: ["content:read"],
      workspace_ids: ["workspace-1"],
      expires_at: "2026-08-08T12:00:00Z",
      revoked_at: null,
      last_used_at: null,
      created_at: "2026-07-08T12:00:00Z",
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, [integration]))
      .mockResolvedValueOnce(
        jsonResponse(201, { token: "rsn_mcp_secret", integration })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await api.listMcpTokens("secret-token")
    await api.createMcpToken("secret-token", {
      name: "OpenCode",
      scopes: ["content:read"],
      workspace_ids: ["workspace-1"],
      expires_in_days: 30,
    })
    await api.revokeMcpToken("secret-token", "integration-1")

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/integrations/mcp/tokens`,
      {
        method: "GET",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/integrations/mcp/tokens`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({
          name: "OpenCode",
          scopes: ["content:read"],
          workspace_ids: ["workspace-1"],
          expires_in_days: 30,
        }),
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/integrations/mcp/tokens/integration-1`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
  })

  it("posts password reset requests without bearer auth", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await api.requestPasswordReset({ email: "israel@example.com" })
    await api.resetPassword({ token: "reset-token", password: "Password123!" })
    await api.changePassword("secret-token", {
      current_password: "Password123!",
      new_password: "NewPassword123!",
    })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/auth/password/forgot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "israel@example.com" }),
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/auth/password/reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "reset-token",
          password: "Password123!",
        }),
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/auth/password/change`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({
          current_password: "Password123!",
          new_password: "NewPassword123!",
        }),
      }
    )
  })

  it("calls workspace endpoints with expected auth, method, and body", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          id: "workspace-1",
          name: "Product",
          created_at: "2026-07-08T12:00:00Z",
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          id: "invite-1",
          workspace_id: "workspace-1",
          email: "person@example.com",
          role: "editor",
          expires_at: "2026-07-15T12:00:00Z",
          created_at: "2026-07-08T12:00:00Z",
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await api.listWorkspaces("secret-token")
    await api.createWorkspace("secret-token", { name: "Product" })
    await api.listWorkspaceMembers("secret-token", "workspace-1")
    await api.inviteWorkspaceMember("secret-token", "workspace-1", {
      email: "person@example.com",
      role: "editor",
    })
    await api.listWorkspaceInvites("secret-token", "workspace-1")
    await api.revokeWorkspaceInvite("secret-token", "workspace-1", "invite-1")
    await api.updateWorkspaceMemberRole(
      "secret-token",
      "workspace-1",
      "user-2",
      "viewer"
    )
    await api.removeWorkspaceMember("secret-token", "workspace-1", "user-2")
    await api.deleteWorkspace("secret-token", "workspace-1")

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/workspaces`, {
      method: "GET",
      headers: { Authorization: "Bearer secret-token" },
      body: undefined,
    })
    expect(fetch).toHaveBeenNthCalledWith(2, `${API_BASE_URL}/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({ name: "Product" }),
    })
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/workspaces/workspace-1/members`,
      {
        method: "GET",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      `${API_BASE_URL}/workspaces/workspace-1/invites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({
          email: "person@example.com",
          role: "editor",
        }),
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      `${API_BASE_URL}/workspaces/workspace-1/invites`,
      {
        method: "GET",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      `${API_BASE_URL}/workspaces/workspace-1/invites/invite-1`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      `${API_BASE_URL}/workspaces/workspace-1/members/user-2`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({ role: "viewer" }),
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      `${API_BASE_URL}/workspaces/workspace-1/members/user-2`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      9,
      `${API_BASE_URL}/workspaces/workspace-1`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
  })

  it("calls invite preview and accept endpoints", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          workspace_name: "Product",
          email: "person@example.com",
          role: "editor",
          expires_at: "2026-07-15T12:00:00Z",
          status: "pending",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "workspace-1",
          name: "Product",
          role: "editor",
          created_at: "2026-07-08T12:00:00Z",
        })
      )

    await api.getWorkspaceInvite("invite-token")
    await api.acceptWorkspaceInvite("secret-token", "invite-token")

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/workspace-invites/invite-token`,
      {
        method: "GET",
        headers: {},
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/workspace-invites/invite-token/accept`,
      {
        method: "POST",
        headers: { Authorization: "Bearer secret-token" },
        body: undefined,
      }
    )
  })

  it("reads pages, page trees and trash with the session token", async () => {
    const pageList = {
      root_page_id: "page-root",
      pages: [
        { id: "page-root", title: "Notas", icon: "🚀", parent_page_id: null },
      ],
    }
    const page = {
      page: { rootId: "page-root", blocks: [] },
      breadcrumbs: [{ id: "page-root", title: "Notas", icon: "🚀" }],
      seq: 7,
    }
    const trash = [
      {
        id: "block-1",
        type: "paragraph",
        title: "rascunho",
        trashed_at: "2026-07-08T12:00:00Z",
      },
    ]
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, pageList))
      .mockResolvedValueOnce(jsonResponse(200, page))
      .mockResolvedValueOnce(jsonResponse(200, trash))

    await expect(api.listPages("secret-token", "ws-1")).resolves.toEqual(
      pageList
    )
    await expect(
      api.getPage("secret-token", "ws-1", "page-root")
    ).resolves.toEqual(page)
    await expect(api.listTrash("secret-token", "ws-1")).resolves.toEqual(trash)

    const headers = { Authorization: "Bearer secret-token" }
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/workspaces/ws-1/pages`,
      {
        method: "GET",
        headers,
        body: undefined,
      }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/workspaces/ws-1/pages/page-root`,
      { method: "GET", headers, body: undefined }
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/workspaces/ws-1/trash`,
      {
        method: "GET",
        headers,
        body: undefined,
      }
    )
  })

  it("lists operations after a cursor for catch-up", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        operations: [
          {
            seq: 3,
            op_id: "op-3",
            actor_id: "user-1",
            operation: {
              type: "update_block",
              opId: "op-3",
              blockId: "b1",
              properties: { text: "hi" },
            },
          },
        ],
        latest_seq: 9,
      })
    )

    await expect(
      api.listOperations("secret-token", "workspace-1", 2, 100, 900)
    ).resolves.toMatchObject({ latest_seq: 9 })

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/workspaces/workspace-1/operations?after_seq=2&limit=100&up_to_seq=900`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      })
    )
  })

  it("builds a workspace websocket url from the api base", () => {
    expect(api.workspaceWsUrl("workspace-1", "tok en")).toBe(
      `${API_BASE_URL.replace(/^http/, "ws")}/workspaces/workspace-1/ws?token=tok%20en`
    )
  })

  it("posts an operation and returns the server ack", async () => {
    const operation: Operation = {
      type: "delete_block",
      opId: "op-1",
      blockId: "block-1",
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { op_id: "op-1", seq: 12 })
    )

    await expect(
      api.applyOperation("secret-token", "ws-1", operation)
    ).resolves.toEqual({ op_id: "op-1", seq: 12 })

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/workspaces/ws-1/operations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify(operation),
      }
    )
  })

  it("calls M4 search, public-link, public-page, and purge endpoints", async () => {
    const publicLink = {
      token: "public-token",
      url: "http://localhost:3000/share/public-token",
      created_at: "2026-07-10T12:00:00Z",
    }
    const publicPage = { page: { rootId: "page-1", blocks: [] } }
    const controller = new AbortController()
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(200, publicLink))
      .mockResolvedValueOnce(jsonResponse(201, publicLink))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(200, publicPage))
      .mockResolvedValueOnce(
        jsonResponse(202, { deleted_blocks: 3, media_cleanup_queued: 1 })
      )

    await api.search("secret-token", "product plan", 20, controller.signal)
    await api.getPublicLink("secret-token", "ws-1", "page-1")
    await api.createPublicLink("secret-token", "ws-1", "page-1")
    await api.revokePublicLink("secret-token", "ws-1", "page-1")
    await expect(api.getPublicPage("public/token")).resolves.toEqual(publicPage)
    await expect(
      api.permanentlyDelete("secret-token", "ws-1", "page-1")
    ).resolves.toEqual({ deleted_blocks: 3, media_cleanup_queued: 1 })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/search?q=product+plan&limit=20`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer secret-token" },
        signal: controller.signal,
      })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/workspaces/ws-1/pages/page-1/public-link`,
      expect.objectContaining({ method: "POST" })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      `${API_BASE_URL}/workspaces/ws-1/pages/page-1/public-link`,
      expect.objectContaining({ method: "DELETE" })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      `${API_BASE_URL}/public/pages/public%2Ftoken`,
      expect.objectContaining({ headers: {} })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      `${API_BASE_URL}/workspaces/ws-1/trash/page-1`,
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("surfaces api errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(401, {
        error: "invalid_credentials",
        message: "Invalid email or password",
      })
    )

    await expect(
      api.login({ email: "israel@example.com", password: "wrong" })
    ).rejects.toMatchObject(
      new ApiError(401, "invalid_credentials", "Invalid email or password")
    )
  })

  it("emits an auth event for invalid sessions", async () => {
    const onUnauthorized = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized)
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(401, {
        error: "unauthorized",
        message: "Missing or invalid session token",
      })
    )

    await expect(api.appSummary("expired-token")).rejects.toMatchObject(
      new ApiError(401, "unauthorized", "Missing or invalid session token")
    )

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized)
  })
})
