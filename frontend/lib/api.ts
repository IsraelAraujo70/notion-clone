import type {
  Block,
  BlockType,
  Operation,
  OperationGroupMetadata,
} from "@/lib/contracts"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:18080"

export type User = {
  id: string
  email: string
  display_name: string
  avatar_url?: string | null
  avatar_key?: string | null
  created_at: string
}

export type PageEditor = {
  user_id: string
  display_name: string
  avatar_url?: string | null
  last_edited_at: string
}

export type PresencePeer = {
  connection_id: string
  user_id: string
  display_name: string
  avatar_url?: string | null
  page_id?: string | null
  focused_block_id?: string | null
  color: string
  last_seen: string
}

export type PresignAvatarResponse = {
  upload_url: string
  key: string
  public_url: string
  headers: { name: string; value: string }[]
}

export type AuthResponse = {
  user: User
  token: string
}

export type WorkspaceRole = "owner" | "editor" | "viewer"

export type Workspace = {
  id: string
  name: string
  role: WorkspaceRole
  created_at: string
}

export type WorkspaceMember = {
  user_id: string
  email: string
  display_name: string
  role: WorkspaceRole
  joined_at: string
}

export type WorkspaceInvite = {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  expires_at: string
  created_at: string
}

export type WorkspaceInvitePreview = {
  workspace_name: string
  email: string
  role: WorkspaceRole
  expires_at: string
  status: "pending" | "accepted" | "expired" | "revoked"
}

export type McpScope =
  | "content:read"
  | "content:write"
  | "search:read"
  | "media:read"

export type McpIntegrationToken = {
  id: string
  name: string
  scopes: McpScope[]
  workspace_ids: string[]
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

export type CreatedMcpIntegrationToken = {
  token: string
  integration: McpIntegrationToken
}

export type PageSummary = {
  id: string
  title: string
  /** Emoji do `properties.icon` da página; string vazia quando não há. */
  icon: string
  parent_page_id: string | null
}

export type PageListResponse = {
  root_page_id: string
  pages: PageSummary[]
}

export type Breadcrumb = {
  id: string
  title: string
  icon: string
}

export type PageResponse = {
  page: { rootId: string; blocks: Block[] }
  breadcrumbs: Breadcrumb[]
  /** Cursor do log de operações do workspace no momento do fetch. */
  seq: number
  recent_editors?: PageEditor[]
}

export type TrashEntry = {
  id: string
  type: BlockType
  title: string
  trashed_at: string
}

export type SearchResult = {
  workspace_id: string
  workspace_name: string
  page_id: string
  page_title: string
  page_icon: string
  block_id: string
  block_type: BlockType
  snippet: string
  rank: number
}

export type PublicLinkResponse = {
  token: string
  url: string
  created_at: string
}

export type PublicPageResponse = {
  page: { rootId: string; blocks: Block[] }
}

export type PermanentDeleteResponse = {
  deleted_blocks: number
  media_cleanup_queued: number
}

export type OperationAck = {
  op_id: string
  seq: number
}

export type TransferSubtreeResponse = {
  transfer_id: string
  source_seq: number
  destination_seq: number
}

export type LoggedOperation = {
  seq: number
  op_id: string
  actor_id: string
  operation: Operation
  group?: OperationGroupMetadata
}

export type OperationsPage = {
  operations: LoggedOperation[]
  latest_seq: number
}

export type AppSummarySection = {
  id: "overview" | "customers" | "settings" | "activity"
  title: string
  description: string
}

export type AppSummaryResponse = {
  product: string
  sections: AppSummarySection[]
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const AUTH_UNAUTHORIZED_EVENT = "reason:auth-unauthorized"

export function isUnauthorizedApiError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    error.code === "unauthorized"
  )
}

type RequestOptions = {
  method?: string
  token?: string | null
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }
  if (options.signal) init.signal = options.signal
  const response = await fetch(`${API_BASE_URL}${path}`, init)

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      payload?.error ?? "unknown_error",
      payload?.message ?? "Request failed"
    )

    if (isUnauthorizedApiError(error) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))
    }

    throw error
  }

  return payload as T
}

export const api = {
  health: () => request<{ status: string; service: string }>("/health"),
  signup: (input: { email: string; password: string; display_name: string }) =>
    request<AuthResponse>("/auth/signup", { method: "POST", body: input }),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input }),
  requestPasswordReset: (input: { email: string }) =>
    request<void>("/auth/password/forgot", {
      method: "POST",
      body: input,
    }),
  resetPassword: (input: { token: string; password: string }) =>
    request<void>("/auth/password/reset", {
      method: "POST",
      body: input,
    }),
  changePassword: (
    token: string,
    input: { current_password: string; new_password: string }
  ) =>
    request<void>("/auth/password/change", {
      method: "POST",
      token,
      body: input,
    }),
  logout: (token: string) =>
    request<void>("/auth/logout", { method: "POST", token }),
  me: (token: string) => request<User>("/auth/me", { token }),
  updateProfile: (
    token: string,
    input: { display_name?: string; avatar_key?: string | null }
  ) =>
    request<User>("/auth/me", {
      method: "PATCH",
      token,
      body: input,
    }),
  presignAvatar: (token: string, contentType: string) =>
    request<PresignAvatarResponse>("/auth/me/avatar/presign", {
      method: "POST",
      token,
      body: { content_type: contentType },
    }),
  listWorkspaces: (token: string) =>
    request<Workspace[]>("/workspaces", { token }),
  createWorkspace: (token: string, input: { name: string }) =>
    request<Omit<Workspace, "role">>("/workspaces", {
      method: "POST",
      token,
      body: input,
    }),
  deleteWorkspace: (token: string, workspaceId: string) =>
    request<void>(`/workspaces/${workspaceId}`, {
      method: "DELETE",
      token,
    }),
  listWorkspaceMembers: (token: string, workspaceId: string) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, {
      token,
    }),
  inviteWorkspaceMember: (
    token: string,
    workspaceId: string,
    input: { email: string; role: WorkspaceRole }
  ) =>
    request<WorkspaceInvite>(`/workspaces/${workspaceId}/invites`, {
      method: "POST",
      token,
      body: input,
    }),
  listWorkspaceInvites: (token: string, workspaceId: string) =>
    request<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`, {
      token,
    }),
  revokeWorkspaceInvite: (
    token: string,
    workspaceId: string,
    inviteId: string
  ) =>
    request<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: "DELETE",
      token,
    }),
  updateWorkspaceMemberRole: (
    token: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ) =>
    request<void>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      token,
      body: { role },
    }),
  removeWorkspaceMember: (token: string, workspaceId: string, userId: string) =>
    request<void>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
      token,
    }),
  listMcpTokens: (token: string) =>
    request<McpIntegrationToken[]>("/integrations/mcp/tokens", { token }),
  createMcpToken: (
    token: string,
    input: {
      name: string
      scopes: McpScope[]
      workspace_ids: string[]
      expires_in_days: number
    }
  ) =>
    request<CreatedMcpIntegrationToken>("/integrations/mcp/tokens", {
      method: "POST",
      token,
      body: input,
    }),
  revokeMcpToken: (token: string, integrationId: string) =>
    request<void>(`/integrations/mcp/tokens/${integrationId}`, {
      method: "DELETE",
      token,
    }),
  getWorkspaceInvite: (token: string) =>
    request<WorkspaceInvitePreview>(`/workspace-invites/${token}`),
  acceptWorkspaceInvite: (authToken: string, inviteToken: string) =>
    request<Workspace>(`/workspace-invites/${inviteToken}/accept`, {
      method: "POST",
      token: authToken,
    }),
  appSummary: (token: string) =>
    request<AppSummaryResponse>("/app/summary", { token }),
  listPages: (token: string, workspaceId: string) =>
    request<PageListResponse>(`/workspaces/${workspaceId}/pages`, { token }),
  getPage: (token: string, workspaceId: string, pageId: string) =>
    request<PageResponse>(`/workspaces/${workspaceId}/pages/${pageId}`, {
      token,
    }),
  transferPage: (
    token: string,
    workspaceId: string,
    pageId: string,
    destinationWorkspaceId: string,
    transferId: string
  ) =>
    request<TransferSubtreeResponse>(
      `/workspaces/${workspaceId}/pages/${pageId}/transfer`,
      {
        method: "POST",
        token,
        body: {
          destination_workspace_id: destinationWorkspaceId,
          transfer_id: transferId,
        },
      }
    ),
  applyOperation: (token: string, workspaceId: string, operation: Operation) =>
    request<OperationAck>(`/workspaces/${workspaceId}/operations`, {
      method: "POST",
      token,
      body: operation,
    }),
  listOperations: (
    token: string,
    workspaceId: string,
    afterSeq: number,
    limit?: number,
    upToSeq?: number
  ) => {
    const params = new URLSearchParams({ after_seq: String(afterSeq) })
    if (limit !== undefined) params.set("limit", String(limit))
    if (upToSeq !== undefined) params.set("up_to_seq", String(upToSeq))
    return request<OperationsPage>(
      `/workspaces/${workspaceId}/operations?${params}`,
      { token }
    )
  },
  listTrash: (token: string, workspaceId: string) =>
    request<TrashEntry[]>(`/workspaces/${workspaceId}/trash`, { token }),
  search: (token: string, query: string, limit = 50, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    })
    return request<SearchResult[]>(`/search?${params}`, { token, signal })
  },
  getPublicLink: (token: string, workspaceId: string, pageId: string) =>
    request<PublicLinkResponse>(
      `/workspaces/${workspaceId}/pages/${pageId}/public-link`,
      { token }
    ),
  createPublicLink: (token: string, workspaceId: string, pageId: string) =>
    request<PublicLinkResponse>(
      `/workspaces/${workspaceId}/pages/${pageId}/public-link`,
      { method: "POST", token }
    ),
  revokePublicLink: (token: string, workspaceId: string, pageId: string) =>
    request<void>(`/workspaces/${workspaceId}/pages/${pageId}/public-link`, {
      method: "DELETE",
      token,
    }),
  getPublicPage: (token: string) =>
    request<PublicPageResponse>(`/public/pages/${encodeURIComponent(token)}`),
  permanentlyDelete: (token: string, workspaceId: string, blockId: string) =>
    request<PermanentDeleteResponse>(
      `/workspaces/${workspaceId}/trash/${blockId}`,
      { method: "DELETE", token }
    ),
  presignPageImage: (token: string, workspaceId: string, contentType: string) =>
    request<PresignAvatarResponse>(
      `/workspaces/${workspaceId}/uploads/presign`,
      {
        method: "POST",
        token,
        body: { content_type: contentType },
      }
    ),
  workspaceWsUrl: (workspaceId: string, token: string) => {
    const base = API_BASE_URL.replace(/^http/, "ws")
    return `${base}/workspaces/${workspaceId}/ws?token=${encodeURIComponent(token)}`
  },
}
