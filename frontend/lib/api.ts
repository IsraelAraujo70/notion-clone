import type { Block, BlockType, Operation } from "@/lib/contracts"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:18080"

export type User = {
  id: string
  email: string
  display_name: string
  created_at: string
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
}

export type TrashEntry = {
  id: string
  type: BlockType
  title: string
  trashed_at: string
}

export type OperationAck = {
  op_id: string
  seq: number
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

type RequestOptions = {
  method?: string
  token?: string | null
  body?: unknown
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? "unknown_error",
      payload?.message ?? "Request failed"
    )
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
  listWorkspaces: (token: string) =>
    request<Workspace[]>("/workspaces", { token }),
  createWorkspace: (token: string, input: { name: string }) =>
    request<Omit<Workspace, "role">>("/workspaces", {
      method: "POST",
      token,
      body: input,
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
  applyOperation: (token: string, workspaceId: string, operation: Operation) =>
    request<OperationAck>(`/workspaces/${workspaceId}/operations`, {
      method: "POST",
      token,
      body: operation,
    }),
  listTrash: (token: string, workspaceId: string) =>
    request<TrashEntry[]>(`/workspaces/${workspaceId}/trash`, { token }),
}
