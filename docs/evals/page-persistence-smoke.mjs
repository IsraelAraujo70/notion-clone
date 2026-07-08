#!/usr/bin/env node
// Eval determinístico do M2: as cinco operações vão ao servidor, a página volta
// exatamente como foi escrita, e replay do mesmo op_id não duplica nada.
//
//   node docs/evals/page-persistence-smoke.mjs [API_BASE_URL]
//
// Não é um teste de gate: precisa da stack de pé (make up).

import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"

const API = process.argv[2] ?? process.env.API_BASE_URL ?? "http://localhost:18080"

let token = null

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text}`)
  }
  return payload
}

function block(type, properties) {
  return {
    id: randomUUID(),
    workspaceId: "00000000-0000-0000-0000-000000000000", // o servidor reescreve
    type,
    properties,
    content: [],
    parentId: null,
    trashedAt: null,
    trashedIndex: null,
  }
}

/** Projeção visível: sem ids, sem trashed. É o que "igualdade exata" compara. */
function visible(blocks, rootId) {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const walk = (id) => {
    const b = byId.get(id)
    assert.ok(b, `bloco ${id} ausente na resposta`)
    return {
      type: b.type,
      properties: b.properties,
      children: b.content.map(walk),
    }
  }
  return walk(rootId)
}

function checkInvariants(blocks, rootId) {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  for (const b of blocks) {
    assert.equal(b.trashedAt, null, `bloco trashed veio no fetch: ${b.id}`)
    for (const childId of b.content) {
      const child = byId.get(childId)
      assert.ok(child, `content de ${b.id} aponta para bloco ausente`)
      assert.equal(child.parentId, b.id, `content/parentId divergem em ${childId}`)
    }
    if (b.id !== rootId) {
      assert.ok(b.parentId, `bloco órfão: ${b.id}`)
      assert.ok(
        byId.get(b.parentId).content.includes(b.id),
        `bloco ${b.id} fora do content do pai`
      )
    }
  }
}

const steps = []
function step(name) {
  steps.push(name)
  console.log(`  ✓ ${name}`)
}

async function main() {
  const email = `eval-pages-${randomUUID()}@example.com`
  const auth = await call("POST", "/auth/signup", {
    email,
    password: "Password123!",
    display_name: "Eval Pages",
  })
  token = auth.token
  step("signup")

  const workspaces = await call("GET", "/workspaces")
  const workspaceId = workspaces[0].id
  const ops = `/workspaces/${workspaceId}/operations`

  const { root_page_id: containerId, pages } = await call(
    "GET",
    `/workspaces/${workspaceId}/pages`
  )
  assert.equal(pages.length, 1, "workspace novo tem exatamente uma página de topo")
  assert.notEqual(pages[0].id, containerId, "o container não é uma página")
  assert.equal(pages[0].parent_page_id, null, "a primeira página é de topo")
  const rootPageId = pages[0].id
  step("workspace novo já nasce com uma página de topo sob o container")

  // O container não é navegável.
  const containerFetch = await fetch(
    `${API}/workspaces/${workspaceId}/pages/${containerId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  assert.equal(containerFetch.status, 404, "o container do workspace devolve 404")
  step("container do workspace não é navegável")

  const initial = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  assert.equal(initial.seq, 0, "nenhuma op aplicada ainda")
  assert.equal(initial.page.blocks.length, 2, "raiz + parágrafo em branco")
  const firstParagraphId = initial.page.blocks.find((b) => b.id !== rootPageId).id
  step("página raiz vem com um parágrafo em branco")

  // --- update_block: título e texto do primeiro parágrafo
  await call("POST", ops, {
    type: "update_block",
    opId: randomUUID(),
    blockId: rootPageId,
    properties: { title: "Notas de lançamento" },
  })
  await call("POST", ops, {
    type: "update_block",
    opId: randomUUID(),
    blockId: firstParagraphId,
    properties: { text: "Toda edição é uma operação." },
  })

  // --- insert_block: heading, to_do, e um filho para virar subárvore
  const heading = block("heading1", { text: "Tarefas" })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: heading,
    parentId: rootPageId,
    index: 99, // clamp: vai para o fim
  })
  const todo = block("to_do", { text: "Persistir blocos", checked: false })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: todo,
    parentId: rootPageId,
    index: 2,
  })
  const nested = block("paragraph", { text: "detalhe" })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: nested,
    parentId: todo.id,
    index: 0,
  })
  step("insert_block com clamp de índice")

  // --- move_block: to_do sobe para o índice 1
  await call("POST", ops, {
    type: "move_block",
    opId: randomUUID(),
    blockId: todo.id,
    newParentId: rootPageId,
    index: 1,
  })
  step("move_block")

  const afterWrites = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  checkInvariants(afterWrites.page.blocks, rootPageId)
  assert.deepEqual(visible(afterWrites.page.blocks, rootPageId), {
    type: "page",
    properties: { title: "Notas de lançamento" },
    children: [
      {
        type: "paragraph",
        properties: { text: "Toda edição é uma operação." },
        children: [],
      },
      {
        type: "to_do",
        properties: { text: "Persistir blocos", checked: false },
        children: [
          { type: "paragraph", properties: { text: "detalhe" }, children: [] },
        ],
      },
      { type: "heading1", properties: { text: "Tarefas" }, children: [] },
    ],
  })
  assert.equal(afterWrites.seq, 6, "seq monotônico por workspace")
  step("árvore persistida bate exatamente com a esperada")

  // --- delete_block: subárvore some da página, filho continua vivo no banco
  const deleteOpId = randomUUID()
  const deleteAck = await call("POST", ops, {
    type: "delete_block",
    opId: deleteOpId,
    blockId: todo.id,
  })
  const afterDelete = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  assert.equal(afterDelete.page.blocks.length, 3, "raiz + parágrafo + heading")
  checkInvariants(afterDelete.page.blocks, rootPageId)

  const trash = await call("GET", `/workspaces/${workspaceId}/trash`)
  assert.equal(trash.length, 1, "só a raiz da subárvore aparece na lixeira")
  assert.equal(trash[0].id, todo.id)
  step("delete_block manda a subárvore inteira para a lixeira")

  // --- idempotência: replay do mesmo op_id não reaplica nem consome seq
  const replay = await call("POST", ops, {
    type: "delete_block",
    opId: deleteOpId,
    blockId: todo.id,
  })
  assert.deepEqual(replay, deleteAck, "replay devolve o ack original")
  const afterReplay = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  assert.equal(afterReplay.seq, afterDelete.seq, "replay não consome seq")
  assert.deepEqual(
    visible(afterReplay.page.blocks, rootPageId),
    visible(afterDelete.page.blocks, rootPageId)
  )
  step("replay do mesmo op_id é idempotente")

  // --- restore_block: volta na posição original, com filhos
  await call("POST", ops, {
    type: "restore_block",
    opId: randomUUID(),
    blockId: todo.id,
  })
  const afterRestore = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  checkInvariants(afterRestore.page.blocks, rootPageId)
  assert.deepEqual(
    visible(afterRestore.page.blocks, rootPageId),
    visible(afterWrites.page.blocks, rootPageId),
    "restore reconstrói a árvore de antes do delete"
  )
  assert.equal((await call("GET", `/workspaces/${workspaceId}/trash`)).length, 0)
  step("restore_block traz a subárvore de volta na posição original")

  // --- página aninhada: bloco 'page' filho é link, não conteúdo inline
  const childPage = block("page", { title: "Sub-página" })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: childPage,
    parentId: rootPageId,
    index: 0,
  })
  const childBody = block("paragraph", { text: "corpo da filha" })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: childBody,
    parentId: childPage.id,
    index: 0,
  })

  const parentView = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  const childInParent = parentView.page.blocks.find((b) => b.id === childPage.id)
  assert.ok(childInParent, "a página filha aparece na página pai")
  assert.deepEqual(childInParent.content, [], "sem expandir os filhos da página filha")
  assert.ok(
    !parentView.page.blocks.some((b) => b.id === childBody.id),
    "o corpo da página filha não vaza para a página pai"
  )

  const childView = await call("GET", `/workspaces/${workspaceId}/pages/${childPage.id}`)
  assert.deepEqual(visible(childView.page.blocks, childPage.id), {
    type: "page",
    properties: { title: "Sub-página" },
    children: [
      { type: "paragraph", properties: { text: "corpo da filha" }, children: [] },
    ],
  })
  assert.deepEqual(
    childView.breadcrumbs.map((crumb) => crumb.title),
    ["Notas de lançamento", "Sub-página"]
  )
  step("página aninhada: link no pai, subárvore própria, breadcrumbs")

  const tree = await call("GET", `/workspaces/${workspaceId}/pages`)
  assert.deepEqual(
    tree.pages.map((page) => [page.title, page.parent_page_id]),
    [
      ["Notas de lançamento", null],
      ["Sub-página", rootPageId],
    ],
    "páginas de topo têm parent null; sub-páginas apontam para a mãe"
  )
  step("sidebar reflete a árvore de páginas")

  // Uma segunda página de topo: irmã da primeira, filha do container.
  const sibling = block("page", { title: "Outra de topo" })
  await call("POST", ops, {
    type: "insert_block",
    opId: randomUUID(),
    block: sibling,
    parentId: containerId,
    index: 99,
  })
  const withSibling = await call("GET", `/workspaces/${workspaceId}/pages`)
  const topLevel = withSibling.pages.filter((page) => page.parent_page_id === null)
  assert.deepEqual(topLevel.map((page) => page.title), [
    "Notas de lançamento",
    "Outra de topo",
  ])
  step("é possível criar uma página de topo irmã, não filha")

  // --- ops inválidas não corrompem nada
  const seqBeforeInvalid = (
    await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  ).seq
  // O container é o único bloco sem pai: não vai ao lixo nem se move.
  const invalid = [
    { type: "delete_block", opId: randomUUID(), blockId: containerId },
    { type: "move_block", opId: randomUUID(), blockId: containerId, newParentId: childPage.id, index: 0 },
    { type: "move_block", opId: randomUUID(), blockId: childPage.id, newParentId: childBody.id, index: 0 },
    { type: "update_block", opId: randomUUID(), blockId: randomUUID(), properties: { text: "x" } },
  ]
  for (const op of invalid) {
    const response = await fetch(`${API}${ops}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(op),
    })
    assert.equal(response.status, 422, `op inválida deveria dar 422: ${op.type}`)
  }
  const untouched = await call("GET", `/workspaces/${workspaceId}/pages/${rootPageId}`)
  assert.equal(untouched.seq, seqBeforeInvalid, "op rejeitada não consome seq")
  step("ops inválidas devolvem 422 e não consomem seq")

  // --- isolamento entre workspaces
  const stranger = await call("POST", "/auth/signup", {
    email: `eval-stranger-${randomUUID()}@example.com`,
    password: "Password123!",
    display_name: "Stranger",
  })
  const forbidden = await fetch(`${API}/workspaces/${workspaceId}/pages/${rootPageId}`, {
    headers: { Authorization: `Bearer ${stranger.token}` },
  })
  assert.equal(forbidden.status, 403, "leitura cross-workspace precisa falhar")
  step("leitura cross-workspace devolve 403")

  console.log(`\nPASS — ${steps.length} verificações\n`)
}

main().catch((error) => {
  console.error(`\nFAIL — ${error.message}\n`)
  process.exit(1)
})
