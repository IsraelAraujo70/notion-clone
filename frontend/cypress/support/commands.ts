import {
  installWorkspaceSocketTracker,
  type SocketTrackingWindow,
} from "./workspace-socket"

type ApiOptions = {
  token?: string
  body?: unknown
  qs?: Record<string, string | number | boolean | null | undefined>
  failOnStatusCode?: boolean
}

type AuthResponse = {
  token: string
  user: {
    id: string
    email: string
    display_name: string
    created_at: string
  }
}

function apiBaseUrl() {
  return String(Cypress.env("apiBaseUrl") ?? "http://localhost:8080").replace(
    /\/$/,
    ""
  )
}

Cypress.Commands.add("api", (method: string, path: string, options = {}) => {
  const typedOptions = options as ApiOptions
  const headers: Record<string, string> = {}
  if (typedOptions.token) {
    headers.Authorization = `Bearer ${typedOptions.token}`
  }

  return cy.request({
    method,
    url: `${apiBaseUrl()}${path}`,
    headers,
    body: typedOptions.body as never,
    qs: typedOptions.qs,
    failOnStatusCode: typedOptions.failOnStatusCode,
  })
})

Cypress.Commands.add(
  "signupByApi",
  (email: string, password = "Password123!") => {
    return cy
      .api<AuthResponse>("POST", "/auth/signup", {
        body: {
          email,
          password,
          display_name: email.split("@")[0],
        },
      })
      .then((response) => response.body)
  }
)

Cypress.Commands.add(
  "loginByApi",
  (email: string, password = "Password123!") => {
    return cy
      .api<AuthResponse>("POST", "/auth/login", {
        body: { email, password },
      })
      .then((response) => response.body)
  }
)

Cypress.Commands.add("authenticatedVisit", (path: string, token: string) => {
  return cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem("notion_clone_token", token)
    },
  })
})

Cypress.Commands.add(
  "authenticatedVisitWithSocketTracker",
  (path: string, token: string) => {
    return cy.visit(path, {
      onBeforeLoad(win) {
        win.localStorage.setItem("notion_clone_token", token)
        installWorkspaceSocketTracker(win as SocketTrackingWindow)
      },
    })
  }
)

declare global {
  namespace Cypress {
    interface Chainable {
      api<T = unknown>(
        method: string,
        path: string,
        options?: ApiOptions
      ): Chainable<Response<T>>
      signupByApi(email: string, password?: string): Chainable<AuthResponse>
      loginByApi(email: string, password?: string): Chainable<AuthResponse>
      authenticatedVisit(path: string, token: string): Chainable<AUTWindow>
      authenticatedVisitWithSocketTracker(
        path: string,
        token: string
      ): Chainable<AUTWindow>
    }
  }
}

export {}
