#!/usr/bin/env node
// Eval determinístico do recovery M3: cria o menor gap que ultrapassa uma
// página (501 ops), congela o cursor-alvo e prova sequência sem lacunas.
//
//   node docs/evals/sync-catch-up-smoke.mjs [API_BASE_URL]
//
// Requer a stack local (`make up`). Nunca aponta para produção por padrão.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API =
  process.argv[2] ?? process.env.API_BASE_URL ?? "http://localhost:18080";
const PAGE_SIZE = 500;
const MISSED_OPS = 501;
const LATE_OPS = 5;
const BATCH_SIZE = 16;

let token = null;

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return payload;
}

async function inBatches(items, worker) {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    await Promise.all(items.slice(start, start + BATCH_SIZE).map(worker));
  }
}

function assertContiguous(entries, firstSeq, lastSeq) {
  assert.equal(entries.length, lastSeq - firstSeq + 1);
  entries.forEach((entry, index) => {
    assert.equal(entry.seq, firstSeq + index, `gap at result index ${index}`);
  });
}

async function main() {
  const auth = await call("POST", "/auth/signup", {
    email: `eval-sync-${randomUUID()}@example.com`,
    password: "Password123!",
    display_name: "Eval Sync",
  });
  token = auth.token;

  const [workspace] = await call("GET", "/workspaces");
  const pageList = await call("GET", `/workspaces/${workspace.id}/pages`);
  const pageId = pageList.pages[0].id;
  const initial = await call(
    "GET",
    `/workspaces/${workspace.id}/pages/${pageId}`,
  );
  const paragraph = initial.page.blocks.find(
    (block) => block.type === "paragraph",
  );
  assert.ok(paragraph, "initial paragraph is required");

  const operationsPath = `/workspaces/${workspace.id}/operations`;
  const initialWrites = Array.from({ length: MISSED_OPS }, (_, index) => {
    const version = index + 1;
    return {
      type: "update_block",
      opId: randomUUID(),
      blockId: paragraph.id,
      properties: { text: `gap-${String(version).padStart(4, "0")}` },
      propVersions: { text: version },
    };
  });
  await inBatches(initialWrites, (operation) =>
    call("POST", operationsPath, operation),
  );

  const firstPage = await call(
    "GET",
    `${operationsPath}?after_seq=${initial.seq}&limit=${PAGE_SIZE}`,
  );
  const targetSeq = initial.seq + MISSED_OPS;
  assert.equal(firstPage.latest_seq, targetSeq);
  assert.equal(firstPage.operations.length, PAGE_SIZE);

  // Escritas posteriores não podem mover o alvo capturado pela primeira página.
  const lateWrites = Array.from({ length: LATE_OPS }, (_, index) => {
    const version = MISSED_OPS + index + 1;
    return {
      type: "update_block",
      opId: randomUUID(),
      blockId: paragraph.id,
      properties: { text: `gap-${String(version).padStart(4, "0")}` },
      propVersions: { text: version },
    };
  });
  await inBatches(lateWrites, (operation) =>
    call("POST", operationsPath, operation),
  );

  const caughtUp = [...firstPage.operations];
  let cursor = caughtUp.at(-1)?.seq ?? initial.seq;
  while (cursor < targetSeq) {
    const page = await call(
      "GET",
      `${operationsPath}?after_seq=${cursor}&limit=${PAGE_SIZE}&up_to_seq=${targetSeq}`,
    );
    assert.equal(page.latest_seq, targetSeq);
    assert.ok(page.operations.length > 0, "catch-up page must make progress");
    caughtUp.push(...page.operations);
    cursor = caughtUp.at(-1).seq;
  }

  assertContiguous(caughtUp, initial.seq + 1, targetSeq);
  assert.equal(new Set(caughtUp.map(({ op_id }) => op_id)).size, MISSED_OPS);
  assert.deepEqual(
    new Set(caughtUp.map(({ op_id }) => op_id)),
    new Set(initialWrites.map(({ opId }) => opId)),
  );

  const tail = await call(
    "GET",
    `${operationsPath}?after_seq=${targetSeq}&limit=${PAGE_SIZE}`,
  );
  assert.equal(tail.operations.length, LATE_OPS);
  assertContiguous(tail.operations, targetSeq + 1, targetSeq + LATE_OPS);

  const finalPage = await call(
    "GET",
    `/workspaces/${workspace.id}/pages/${pageId}`,
  );
  const finalParagraph = finalPage.page.blocks.find(
    (block) => block.id === paragraph.id,
  );
  assert.equal(finalPage.seq, targetSeq + LATE_OPS);
  assert.equal(finalParagraph.properties.text, "gap-0506");
  assert.equal(finalParagraph.propVersions.text, 506);

  console.log(
    `PASS - ${MISSED_OPS} missed ops recovered in ${Math.ceil(MISSED_OPS / PAGE_SIZE)} pages; ${LATE_OPS} later ops stayed outside the frozen snapshot`,
  );
}

main().catch((error) => {
  console.error(`FAIL - ${error.message}`);
  process.exit(1);
});
