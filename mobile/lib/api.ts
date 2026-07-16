import type { Block, Operation } from "@reason/core/contracts"

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://api.reason.israeldeveloper.com.br"

export type User = {
  id: string
  email: string
  display_name: string
  avatar_url?: string | null
}

export type AuthResponse = { user: User; token: string }
export type WorkspaceRole = "owner" | "editor" | "viewer"
export type Workspace = {
  id: string
  name: string
  role: WorkspaceRole
  created_at: string
}
export type PageSummary = {
  id: string
  title: string
  icon: string
  parent_page_id: string | null
}
export type PageListResponse = {
  root_page_id: string
  pages: PageSummary[]
}
export type PageResponse = {
  page: { rootId: string; blocks: Block[] }
  breadcrumbs: { id: string; title: string; icon: string }[]
  seq: number
}
export type OperationAck = { op_id: string; seq: number }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (response.status === 204) return undefined as T

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
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input }),
  me: (token: string) => request<User>("/auth/me", { token }),
  logout: (token: string) =>
    request<void>("/auth/logout", { method: "POST", token }),
  listWorkspaces: (token: string) =>
    request<Workspace[]>("/workspaces", { token }),
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
}
