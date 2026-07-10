#!/usr/bin/env node
// Eval local do limite de logging HTTP: autentica um WebSocket com um token
// real e prova que o runtime registra apenas o template da rota.
//
//   make eval-request-log-redaction
//
// Requer a stack local (`make up`). Recusa hosts não locais para não criar
// dados nem coletar logs em produção.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"

const API = process.env.API_BASE_URL ?? "http://localhost:18080"
const apiUrl = new URL(API)
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname),
  "request-log-redaction eval only runs against a local API"
)

async function call(method, path, body, token) {
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

function connectUntilHello(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error("WebSocket hello timed out"))
    }, 5_000)

    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error("WebSocket connection failed"))
    })
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data))
      if (message.type !== "hello") return
      clearTimeout(timeout)
      socket.close()
      resolve(message)
    })
  })
}

function apiLogsSince(since) {
  const logs = execFileSync(
    "docker",
    ["compose", "logs", "--no-color", "--since", since, "api"],
    { encoding: "utf8" }
  )
  return logs.replace(/\u001b\[[0-9;]*m/g, "")
}

async function waitForTrace(since) {
  const expectedRoute = 'route="/workspaces/{workspace_id}/ws"'
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const logs = apiLogsSince(since)
    if (logs.includes(expectedRoute)) return logs
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("safe WebSocket route trace was not emitted")
}

async function main() {
  const since = new Date(Date.now() - 1_000).toISOString()
  const auth = await call("POST", "/auth/signup", {
    email: `eval-log-redaction-${randomUUID()}@example.com`,
    password: "Password123!",
    display_name: "Eval Log Redaction",
  })
  const workspaces = await call("GET", "/workspaces", undefined, auth.token)
  const wsUrl = new URL(`/workspaces/${workspaces[0].id}/ws`, apiUrl)
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:"
  wsUrl.searchParams.set("token", auth.token)

  const hello = await connectUntilHello(wsUrl)
  assert.equal(typeof hello.latest_seq, "number")

  const logs = await waitForTrace(since)
  assert.ok(logs.includes('route="/workspaces/{workspace_id}/ws"'))
  assert.ok(!logs.includes(auth.token), "session token leaked into request logs")
  assert.ok(!logs.includes("?token="), "raw WebSocket query leaked into request logs")

  console.log("PASS - WebSocket auth succeeded and request logs contain no token")
}

main().catch((error) => {
  console.error(`FAIL - ${error.message}`)
  process.exit(1)
})
