import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Operation } from "@/lib/contracts"
import { ApiError, api, API_BASE_URL } from "./api"

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
      pages: [{ id: "page-root", title: "Notas", icon: "🚀", parent_page_id: null }],
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

    await expect(api.listPages("secret-token", "ws-1")).resolves.toEqual(pageList)
    await expect(api.getPage("secret-token", "ws-1", "page-root")).resolves.toEqual(page)
    await expect(api.listTrash("secret-token", "ws-1")).resolves.toEqual(trash)

    const headers = { Authorization: "Bearer secret-token" }
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/workspaces/ws-1/pages`, {
      method: "GET",
      headers,
      body: undefined,
    })
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/workspaces/ws-1/pages/page-root`,
      { method: "GET", headers, body: undefined }
    )
    expect(fetch).toHaveBeenNthCalledWith(3, `${API_BASE_URL}/workspaces/ws-1/trash`, {
      method: "GET",
      headers,
      body: undefined,
    })
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

    expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/workspaces/ws-1/operations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify(operation),
    })
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
})
