#!/usr/bin/env node
// Eval determinístico do M4: busca permissionada, papéis, publicação read-only,
// revogação por trash e purge com remoção assíncrona de mídia.
//
//   make eval-m4
//
// Requer a stack local (`make backend`). Usa SQL apenas para montar editor e
// viewer sem depender da entrega real de e-mail. Recusa hosts não locais.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"

const API = process.argv[2] ?? process.env.API_BASE_URL ?? "http://localhost:18080"
const apiUrl = new URL(API)
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname),
  "m4 eval only runs against a local API"
)

async function request(method, path, { token, body, expected = [200] } = {}) {
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  assert.ok(
    expected.includes(response.status),
    `${method} ${path} -> ${response.status} ${text}`
  )
  return { status: response.status, body: payload }
}

async function signup(label) {
  const response = await request("POST", "/auth/signup", {
    body: {
      email: `eval-m4-${label}-${randomUUID()}@example.com`,
      password: "Password123!",
      display_name: label,
    },
    expected: [201],
  })
  return response.body
}

function seedMembership(workspaceId, userId, role) {
  assert.match(workspaceId, /^[0-9a-f-]{36}$/i)
  assert.match(userId, /^[0-9a-f-]{36}$/i)
  assert.match(role, /^(editor|viewer)$/)
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "notion_clone",
      "-c",
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ('${workspaceId}', '${userId}', '${role}')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    ],
    { stdio: "ignore" }
  )
}

async function apply(token, workspaceId, operation) {
  return request("POST", `/workspaces/${workspaceId}/operations`, {
    token,
    body: operation,
    expected: [200],
  })
}

async function waitUntilMissing(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus = 0
  while (Date.now() < deadline) {
    const response = await fetch(url, { redirect: "follow" })
    lastStatus = response.status
    if (response.status === 404) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.fail(`media still exists after ${timeoutMs}ms (last status ${lastStatus})`)
}

function step(message) {
  console.log(`  ok ${message}`)
}

async function main() {
  const [owner, editor, viewer, outsider] = await Promise.all([
    signup("owner"),
    signup("editor"),
    signup("viewer"),
    signup("outsider"),
  ])
  const workspaces = await request("GET", "/workspaces", { token: owner.token })
  const workspaceId = workspaces.body[0].id
  seedMembership(workspaceId, editor.user.id, "editor")
  seedMembership(workspaceId, viewer.user.id, "viewer")
  step("fixture owner/editor/viewer/nonmember")

  const pageList = await request("GET", `/workspaces/${workspaceId}/pages`, {
    token: owner.token,
  })
  const pageId = pageList.body.pages[0].id
  const page = await request("GET", `/workspaces/${workspaceId}/pages/${pageId}`, {
    token: owner.token,
  })
  const paragraphId = page.body.page.blocks.find((block) => block.type === "paragraph").id

  await apply(owner.token, workspaceId, {
    type: "update_block",
    opId: randomUUID(),
    blockId: pageId,
    properties: { title: "Projeto M4 pesquisável" },
  })
  await apply(owner.token, workspaceId, {
    type: "update_block",
    opId: randomUUID(),
    blockId: paragraphId,
    properties: { text: "agulha permissionada do milestone quatro" },
  })

  for (const actor of [owner, editor, viewer]) {
    const search = await request("GET", "/search?q=agulha%20permissionada", {
      token: actor.token,
    })
    assert.ok(search.body.some((result) => result.block_id === paragraphId))
  }
  const outsiderSearch = await request("GET", "/search?q=agulha%20permissionada", {
    token: outsider.token,
  })
  assert.equal(outsiderSearch.body.length, 0)
  step("search is global for members and isolated from nonmembers")

  await request("GET", `/workspaces/${workspaceId}/pages/${pageId}`, {
    token: viewer.token,
  })
  await request("POST", `/workspaces/${workspaceId}/operations`, {
    token: viewer.token,
    body: {
      type: "update_block",
      opId: randomUUID(),
      blockId: paragraphId,
      properties: { text: "viewer cannot write" },
    },
    expected: [403],
  })
  await request("GET", `/workspaces/${workspaceId}/pages/${pageId}`, {
    token: outsider.token,
    expected: [403],
  })
  step("viewer reads but cannot write; nonmember cannot read")

  const childPageId = randomUUID()
  await apply(owner.token, workspaceId, {
    type: "insert_block",
    opId: randomUUID(),
    parentId: pageId,
    index: 99,
    block: {
      id: childPageId,
      workspaceId,
      type: "page",
      properties: { title: "Subpágina privada" },
      content: [],
      parentId: null,
      trashedAt: null,
      trashedIndex: null,
    },
  })

  await request("POST", `/workspaces/${workspaceId}/pages/${pageId}/public-link`, {
    token: viewer.token,
    expected: [403],
  })
  const published = await request(
    "POST",
    `/workspaces/${workspaceId}/pages/${pageId}/public-link`,
    { token: editor.token, expected: [200, 201] }
  )
  const publicPage = await request("GET", `/public/pages/${published.body.token}`)
  assert.equal(publicPage.body.page.rootId, pageId)
  assert.ok(!publicPage.body.page.blocks.some((block) => block.id === childPageId))
  assert.ok(
    publicPage.body.page.blocks.every((block) => !block.content.includes(childPageId))
  )
  step("editor publishes; viewer cannot; child pages stay private")

  await request("DELETE", `/workspaces/${workspaceId}/pages/${pageId}/public-link`, {
    token: editor.token,
    expected: [204],
  })
  await request("GET", `/public/pages/${published.body.token}`, { expected: [404] })
  const republished = await request(
    "POST",
    `/workspaces/${workspaceId}/pages/${pageId}/public-link`,
    { token: owner.token, expected: [200, 201] }
  )
  step("revocation returns 404 and page can be republished")

  const upload = await request("POST", `/workspaces/${workspaceId}/uploads/presign`, {
    token: owner.token,
    body: { content_type: "image/png" },
  })
  const uploadHeaders = Object.fromEntries(
    upload.body.headers.map(({ name, value }) => [name, value])
  )
  const put = await fetch(upload.body.upload_url, {
    method: "PUT",
    headers: uploadHeaders,
    body: new Uint8Array([137, 80, 78, 71]),
  })
  assert.ok(put.ok, `media upload failed: ${put.status}`)
  const imageId = randomUUID()
  await apply(owner.token, workspaceId, {
    type: "insert_block",
    opId: randomUUID(),
    parentId: pageId,
    index: 99,
    block: {
      id: imageId,
      workspaceId,
      type: "image",
      properties: {
        key: upload.body.key,
        url: upload.body.public_url,
        caption: "imagem do purge",
      },
      content: [],
      parentId: null,
      trashedAt: null,
      trashedIndex: null,
    },
  })

  await apply(owner.token, workspaceId, {
    type: "delete_block",
    opId: randomUUID(),
    blockId: pageId,
  })
  await request("GET", `/public/pages/${republished.body.token}`, { expected: [404] })
  const trashedSearch = await request("GET", "/search?q=agulha%20permissionada", {
    token: owner.token,
  })
  assert.equal(trashedSearch.body.length, 0)
  step("trash revokes sharing and removes descendants from search")

  const purged = await request(
    "DELETE",
    `/workspaces/${workspaceId}/trash/${pageId}`,
    { token: editor.token, expected: [202] }
  )
  assert.ok(purged.body.deleted_blocks >= 4)
  assert.equal(purged.body.media_cleanup_queued, 1)
  await request("GET", `/workspaces/${workspaceId}/pages/${pageId}`, {
    token: owner.token,
    expected: [404],
  })
  await waitUntilMissing(upload.body.public_url)
  step("permanent delete removes subtree and worker deletes media")

  console.log("\nPASS - M4 search, permissions, sharing and purge")
}

main().catch((error) => {
  console.error(`FAIL - ${error.stack ?? error.message}`)
  process.exitCode = 1
})
