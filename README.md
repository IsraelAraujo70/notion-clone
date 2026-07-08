# Notion Clone

This repository is the answer to the [Notion Clone Challenge](./challenge.md): a portfolio-grade collaborative workspace built with a Rust backend, a TypeScript frontend, PostgreSQL with pgvector, and a Railway-first deployment target.

The goal is to build a real product experience first, then document how the system can grow toward the larger system-design targets from the challenge. The two headline ideas are the ones Notion itself is built on: everything is a block, and every edit is an operation.

## Product Direction

The first version should be a working collaborative workspace. Target v1 scope:

- Sign up, log in, create a workspace, invite members.
- Write pages with a keyboard-first block editor (paragraphs, headings, lists, to-dos, toggles, quotes, code, callouts, dividers).
- Nest pages arbitrarily and navigate them from a sidebar tree.
- Collaborate in real time: two browsers on the same page converge.
- Search everything you can access.
- Trash and restore block subtrees.
- Use AI that writes into the page through the same operation path as a user: continue writing, summarize, transform selection, and workspace Q&A with cited sources.

Explicit v1 cuts (decisions, not accidents):

- No Notion-style databases (table views, filters, formulas). This is half of Notion's product complexity and it is a separate video.
- No desktop client yet. The web app is the v1 so viewers can test it without installing anything. The sync engine is designed so a desktop client with a local SQLite replica can be added later without changing the protocol.
- Permissions are workspace-scoped in v1 (member or not), plus revocable public read-only page links. Page-level permissions are a future extension.

## How Notion Actually Works (and what we borrow)

The reference architecture, from Notion's public engineering material:

- **Everything is a block.** One `blocks` table holds paragraphs, pages, images, everything. A block has a type, JSON properties, an ordered list of child block ids, and a parent pointer. Rendering a page is walking a subtree.
- **Postgres, sharded by `workspace_id`.** Notion went from one Postgres instance to 480 logical shards on 32 machines (2021), then rebalanced onto 96 machines (2023) using logical replication with zero downtime. Almost every product query lives inside one workspace, so one request hits one shard.
- **Not CRDT.** Notion's real-time collaboration is an operation log with last-writer-wins at the block-property level. Blocks are granular enough that true conflicts are rare, and the system stays simple enough to reason about.
- **Data lake for AI.** CDC from the shards (Debezium, Kafka, Hudi, S3, Spark) feeds embeddings and search instead of hammering production Postgres.
- **SQLite on the client.** Notion added SQLite caching in the browser (WASM) and desktop, then shipped offline mode on top of it.

What this clone borrows at portfolio scale: the block model verbatim, the operation log with LWW verbatim, `workspace_id` as the partition key on every table and every query so sharding stays a pure infra move, pgvector instead of a data lake, and the SQLite client as a documented future step.

## Proposed Architecture

Use a services-first monorepo, bootstrapped from `microsaas-starter` (which already ships auth/sessions/password-reset, the dashboard shell, Cypress, and the Railway deploy shape proven in drive-clone):

- `frontend`: TypeScript/Next.js (App Router) frontend with the block editor, shadcn/ui, Notion-style theme.
- `backend`: Rust HTTP + WebSocket API in the ports-and-adapters layout used by drive-clone (`domain/`, `application/` with ports, `adapters/{http,postgres,email}`, `bootstrap/`), plus the worker binary under `src/bin`.
- `contracts`: the language-neutral spec of the block model and operation schema. TypeScript types live in `frontend/lib/contracts.ts`; the Rust side mirrors the spec (M2+).
- `docs`: architecture notes, API docs, and deployment notes.

The backend owns blocks, the operation log, sync, real-time broadcast, membership and permissions, search, trash lifecycle, the AI service, and background jobs. PostgreSQL (with pgvector) stores everything durable: metadata, operations, full-text indexes, and embeddings.

```text
Browser A ──┐                        ┌── Browser B
  editor    │   WebSocket (ops)      │
  op queue  ├──────────┬─────────────┤
            │          │             │
            ▼          ▼             ▼
        ┌──────────────────────────────┐
        │        backend (Rust)        │
        │  apply ops (LWW) → op log    │
        │  broadcast → subscribers     │
        │  auth / permissions / search │
        │  ai service (typed contract) │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │   PostgreSQL + pgvector      │
        │ blocks · operations · users  │
        │ workspaces · embeddings      │
        └──────────────────────────────┘
                       ▲
        worker: embeddings, trash purge,
        op-log compaction, orphan cleanup
```

The AI is drawn inside the backend on purpose: it is a client of the same op-apply function, not a separate write path.

## Repository Structure

```text
frontend/
  app/            # App Router (login, signup, reset-password, dashboard)
  components/     # shadcn/ui + editor/ (BlockEditor, SlashMenu)
  lib/            # contracts.ts, engine/ (op apply + undo), editor/ helpers
  cypress/
backend/
  src/domain/     # entities and domain rules
  src/application/# use-cases + ports
  src/adapters/   # http, postgres, email
  src/bootstrap/  # config, state, router, health
  src/bin/        # api + worker
  migrations/
contracts/        # protocol spec (README.md)
docs/
```

## Core Components

Backend API:

- Authentication and sessions.
- Workspace and membership management.
- Block reads: page subtree fetch, sidebar tree, breadcrumbs.
- Operation apply: validate, authorize, LWW-resolve, persist, assign cursor, broadcast.
- Sync: `GET /sync/operations?cursor=` for reconnection recovery.
- WebSocket subscriptions per workspace/page.
- Full-text and semantic search, permission-scoped.
- Trash lifecycle.
- AI endpoints that stream operations.
- Health checks and metrics.

Frontend:

- Login, signup, and workspace screens.
- Block editor: each block is its own small contenteditable element; the editor state is the block tree, not one big document.
- Slash menu, markdown shortcuts, drag reorder, indent/outdent.
- Local op queue with optimistic apply and undo stack (undo emits inverse ops).
- WebSocket client with cursor-based catch-up on reconnect.
- Sidebar page tree, breadcrumbs, search UI, trash UI.
- AI surfaces: inline "continue writing", page summarize, selection transform, Q&A panel with clickable citations.

Worker:

- Embedding refresh for changed blocks (debounced, batched).
- Trash purge after retention.
- Operation log compaction/archival.
- Orphan and consistency reconciliation.

## Suggested Tech Stack

Backend:

- Rust, ports-and-adapters (same shape as drive-clone/microsaas-starter).
- Axum for HTTP and WebSocket routing.
- Tokio for async runtime.
- SQLx for PostgreSQL.
- Serde for JSON.
- tower-http for tracing, CORS, and middleware.
- pgvector via SQLx (the `pgvector` crate).
- Auth from the starter: argon2 password hashing, opaque session tokens stored hashed, single-use reset tokens, optional Resend email (noop locally).

Frontend:

- TypeScript.
- React.
- Next.js (App Router).
- Tailwind CSS.
- shadcn/ui.
- Custom block editor. No ProseMirror/TipTap/Slate: those frameworks model one rich document, and the whole point here is that a page is a tree of small blocks. One contenteditable per block keeps each editing surface trivial and makes the block model the real editor state. Tradeoff documented: rich inline formatting (bold/italic/links inside a block) starts minimal.

AI:

- Anthropic API behind the `contracts/` AI service contract; the provider is swappable because nothing outside the service knows which model answered.
- Embeddings model behind the same contract.
- pgvector for storage and retrieval. No separate vector database.

Infrastructure:

- Railway backend service.
- Railway frontend service.
- Railway PostgreSQL with the pgvector extension enabled.
- Railway worker service.

## Data Model

Core tables (all workspace-scoped tables carry `workspace_id`):

- `users`: account identity.
- `workspaces`: tenant root.
- `workspace_members`: membership and role.
- `blocks`: `id`, `workspace_id`, `type`, `properties` (jsonb), `content` (ordered array of child block ids), `parent_id`, `created_by`, timestamps, `trashed_at`. Pages are rows in this table.
- `operations`: the log. `workspace_id`, monotonic `seq` per workspace, `actor_id` (user or AI), `op` (jsonb), `applied_at`. This is the sync feed, the audit trail, and the AI's paper trail.
- `page_links`: revocable public read-only tokens (stored hashed).
- `block_embeddings`: `block_id`, `workspace_id`, `embedding` (vector), `content_hash`, `updated_at`. HNSW index. `content_hash` makes the refresh job idempotent.
- `sessions`: opaque bearer tokens, stored hashed.

Partition key discipline: every query filters by `workspace_id` first. That is the entire sharding story prepared in advance: when one Postgres is not enough, split by workspace and nothing above the storage layer changes.

## Block Model Design

A page render is: fetch the page block, fetch its subtree (recursive CTE with a depth/size cap), hand the tree to the editor.

Rules:

- `content` arrays own ordering; `parent_id` owns membership. The two must always agree, and the invariant is enforced in the op-apply function and checked by tests.
- Turning a block into another type is an `update` op on `type`. No data migration.
- Indent/outdent is a `move` op. The editor never mutates structure except through ops.

Measurable outcomes:

- Every editor capability maps to one of five op types.
- Subtree fetch for a 500-block page stays under one round trip.
- No orphan blocks: every block is reachable from a workspace root or the trash.

## Operation and Sync Design

Op types (defined once in `contracts/`, imported by both sides):

- `insert_block { block, parent_id, index }`
- `update_block { block_id, property_patches, prop_versions }`
- `move_block { block_id, new_parent_id, index }`
- `delete_block { block_id }` (soft, subtree)
- `restore_block { block_id }`

Flow:

1. The editor applies the op to local state immediately (optimistic) and pushes it to the outgoing queue with a client-generated `op_id` (uuid).
2. The queue sends ops over the WebSocket in order.
3. The server authorizes, resolves conflicts (below), persists the block change and the op row in one transaction, assigns the next per-workspace `seq`, and acks with `{op_id, seq}`.
4. The server broadcasts the op to every other subscriber of that workspace/page.
5. Remote clients apply incoming ops; the sender ignores its own echo by `op_id`.

Conflict resolution: last-writer-wins per block property. Each property carries a version counter; an `update` op includes the version it saw, and the server keeps the write with the highest version (server arrival order breaks ties). Structural ops (`move`, `insert`) are serialized by the per-workspace transaction, so the tree never corrupts. This is deliberately not CRDT, and the README of record says so: it is the same tradeoff Notion made.

Recovery: on reconnect the client sends its last acked `seq` and receives everything after it from `GET /sync/operations?cursor=`. Idempotency: `op_id` is unique; replays are acked without reapplying.

Measurable outcomes:

- Two clients issuing interleaved ops converge to byte-identical page trees (e2e test).
- A client offline for N ops recovers all N from its cursor (e2e test).
- Duplicate op delivery does not double-apply (gate test).
- Local echo never waits on the network.

## Real-Time Collaboration Design

- One WebSocket per client, subscriptions per workspace with page-level filtering server-side.
- Broadcast fan-out happens in-process in v1 (single backend instance). The documented scale path is a pub/sub layer (Redis or NATS) between backend instances; nothing in the protocol changes.
- Presence (cursors, avatars) is a future extension carried over the same socket.

Measurable outcomes:

- Remote edit visible in a second browser in under 2 seconds (e2e test with two Cypress-driven sessions or one browser plus an API-driven actor).

## Permissions Design

- Workspace membership gates everything in v1: members read and write, non-members see nothing.
- Public page links grant read-only access to one page subtree via a hashed token, revocable, uniform 404 on invalid/revoked/trashed.
- Every read path passes through the same authorization check: page fetch, search, sync feed, embeddings query, AI context assembly. One function, used everywhere, tested everywhere.

Measurable outcomes:

- Cross-workspace reads fail in browse, search, sync, public links, and AI answers (e2e coverage for each path).

## Search Design

Two lanes, one database:

- Lexical: PostgreSQL full-text search (`tsvector` over block text properties, GIN index), for "find the page called X".
- Semantic: pgvector similarity over `block_embeddings`, for "where did we discuss Y", and as the retrieval layer for AI Q&A.

Both queries filter by workspace membership inside the SQL, not in application code after the fact.

Measurable outcomes:

- Search returns nothing from workspaces the user does not belong to (gate + e2e tests).
- Trashed content is excluded by default.
- Embedding refresh lag is observable (metric: blocks pending embedding).

## AI Integration Design

The three principles, made concrete:

**1. The AI is a client of the sync engine.** AI endpoints do not return text. They stream operations. "Continue writing" produces a stream of `insert_block` ops that go through the exact same apply function as a user's ops, with `actor_id` marking the AI. Consequences, for free: output appears block by block in real time for every collaborator, undo works (inverse ops), the op log audits everything the AI ever did, and permissions are enforced because the apply path already enforces them. There is no second write path to secure or debug.

**2. Context is assembled, not dumped.** `backend/src/ai/context.rs` is a deterministic function: `(workspace_id, user_id, block_id, task) -> Context`. It serializes the current page subtree to a compact text form, adds ancestor titles for orientation, runs a permission-scoped pgvector query for related blocks when the task needs workspace knowledge, and cuts everything to an explicit token budget with documented priority order (page > ancestors > retrieved blocks). It is pure and unit-tested: same inputs, same context, no LLM involved.

**3. Quality is measured.** The LLM lives behind one typed contract in `contracts/`: `complete(context, task) -> op stream` and `embed(texts) -> vectors`. Deterministic gate tests cover context assembly, op-stream parsing, and budget enforcement. A paid eval suite scores the four features against fixture workspaces with pass thresholds, and runs before ship.

Features and their op shapes:

- Continue writing: `insert_block`* after the cursor block.
- Summarize page: read subtree, `insert_block` (callout) at index 0.
- Transform selection: `insert_block`* + `delete_block`* replacing the selection, transactional.
- Workspace Q&A: retrieval via pgvector, answer with source `block_id`s the frontend renders as clickable citations. Read-only, no ops.

Measurable outcomes:

- AI output is visible in a second collaborating browser as it streams (e2e).
- Undo after an AI insertion restores the previous state exactly (gate test on inverse ops).
- Q&A citations always resolve to blocks the asking user can access (e2e).
- Eval scores per feature tracked across commits.

## Railway Deployment Plan

Recommended Railway resources:

- Backend service: Rust API + WebSocket.
- Frontend service: Next.js app.
- PostgreSQL service with `CREATE EXTENSION vector` run by the first migration.
- Worker service: embeddings, purge, compaction, reconciliation.

Required deployment behavior:

- `/health` returns healthy only when Postgres is reachable and the pgvector extension is present.
- Frontend reads the deployed API base URL from configuration.
- Backend reads all configuration from environment variables, including the LLM API key.
- Database migrations run through a controlled command.
- Every release gets a smoke test: sign in, create a page, type a block, see it from a second session, run one AI action.

One WebSocket caveat to verify early: Railway supports WebSockets, but confirm proxy timeout behavior with a heartbeat ping so idle editors do not silently disconnect.

## Roadmap

### M1: Local block editor — DONE (2026-07-08)

Deliver: block tree state, contenteditable-per-block editor, slash menu, markdown shortcuts, indent/outdent, drag reorder, undo via inverse ops. All in-memory, no server.

Done when: a page with every block type can be written keyboard-only, and undo/redo is exact.

Status: shipped. Engine in `frontend/lib/engine/` (op apply returns inverse ops; seeded 200-op fuzz proves invariants and exact full-undo), editor UI in `frontend/components/editor/`. The fuzz caught a real design bug: soft-delete must remove the id from the parent's `content` (ghost slots shift move indexes during undo) — hence `trashedIndex` in the contract. Auth + workspaces landed early via the starter rebase (signup creates a "Pessoal" workspace transactionally).

### M2: Persistence and pages

Deliver: `blocks` table, page subtree API, sidebar tree, breadcrumbs, the five op types applied through the server, trash/restore. (Auth and workspaces already landed with the starter rebase.)

Done when: a page survives a refresh and trash/restore keeps subtrees intact.

### M3: Sync and real-time

Deliver: op queue, WebSocket transport, per-workspace op log with cursors, ack/echo protocol, LWW conflict resolution, reconnection recovery, two-client e2e convergence tests.

Done when: two browsers editing the same page converge, and a disconnected client catches up from its cursor.

### M4: Membership, permissions, search

Deliver: invite by email, workspace scoping on every read path, public read-only page links, full-text search, permission e2e suite.

Done when: cross-workspace access fails everywhere and search finds only what it should.

### M5: AI

Deliver: `contracts/` AI contract, context builder with tests, embeddings worker + pgvector retrieval, the four features streaming ops, eval suite with thresholds.

Done when: AI writes stream into a collaborator's browser, undo works on AI output, and Q&A cites real accessible blocks.

### M6: Hardening and deploy

Deliver: Railway deployment, worker jobs, observability, load sanity checks on op apply and subtree fetch, architecture diagram, failure-mode notes, demo script.

Done when: the deployed URL passes the full smoke test and the README matches reality.

## Tests

Gate tests (deterministic, local, fast, every commit):

- Op apply: all five op types, LWW property resolution, idempotent replay, inverse-op undo.
- Tree invariants: `content`/`parent_id` agreement, no orphans, cycle rejection on move.
- Authorization: workspace scoping on page fetch, search, sync, embeddings, AI context.
- Context builder: deterministic output, budget enforcement, priority order.
- Op-stream parsing from LLM output, including malformed stream handling.

End-to-end tests (Cypress against the real Docker stack):

- Two-session convergence on the same page.
- Reconnection catch-up from a cursor.
- Trash/restore lifecycle across sessions.
- Permission denial on every read path.
- AI streaming visible to a second session; undo of AI output.
- Public link access and revocation.

Evals (paid, threshold-gated, before ship and nightly):

- Continue-writing style match against fixture pages.
- Summary faithfulness (no invented facts).
- Transform correctness (structure matches the request).
- Q&A groundedness (answers supported by cited blocks).

## Observability

Track:

- Op apply rate, latency, and failure rate by reason.
- WebSocket connections, reconnects, and catch-up sizes.
- Remote propagation latency (op applied to op delivered).
- Search query rates and latency, lexical vs semantic.
- Blocks pending embedding (refresh lag).
- AI requests, streamed ops, token spend, eval scores per feature.
- Permission denials by path (a spike is either an attack or a bug).
- Worker job outcomes.

## Demo Script

1. Sign up, create a workspace.
2. Write a page keyboard-only: headings, list, to-dos, toggle, code, slash menu.
3. Open a second browser as a second member: watch edits converge both ways.
4. Kill the network on one client, keep typing on the other, reconnect, watch catch-up.
5. Ask AI to continue writing: blocks stream in, visible in both browsers. Undo it.
6. Summarize the page. Transform bullets into another structure.
7. Ask a workspace question, click a citation, land on the source block.
8. Search, trash a subtree, restore it.
9. Share a public link, open it logged out, revoke it, get the 404.
10. Show the op log, the tests, and the eval scores.

## Local Development

Same workflow as drive-clone/microsaas-starter:

```bash
cp .env.example .env

# Full stack (Postgres+pgvector, Rust API, Next.js web):
make dev

# URLs:
# Web: http://localhost:3000
# API: http://localhost:18080/health
# Postgres: localhost:55433 (db notion_clone)
```

`make test` runs the Rust (`cargo test --lib --bins`) and Vitest gates; `make test-e2e` runs Cypress against the composed stack. AI evals arrive with M5.

## Current Status

M1 done (2026-07-08): in-memory block editor with every block type, slash menu, markdown shortcuts, indent/outdent, drag reorder, and exact undo/redo via inverse ops — engine covered by deterministic tests including a seeded fuzz. The repo was rebased on `microsaas-starter`, so auth (signup/login/logout/reset) and workspaces are already live against the Rust API. Next: M2 — persist blocks through the server (page subtree API, sidebar tree, trash/restore).
