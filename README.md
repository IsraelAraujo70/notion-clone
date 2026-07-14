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

## Arquitetura atual

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
- Slash menu, markdown shortcuts, paste estrutural de Markdown em blocos, debounce de 300 ms, marquee multi-bloco, clipboard estruturado, menu contextual e drag multiplo, indent/outdent.
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

AI (M5 concluido):

- OpenRouter e o adaptador implementado, isolado por um contrato interno tipado de chat streaming e embeddings; nenhum caso de uso chama o provedor diretamente.
- Chat padrao: `openai/gpt-5.6-luna`. Titulos de conversa sao gerados a partir da primeira mensagem por `deepseek/deepseek-v4-flash`. Embeddings: `openai/text-embedding-3-large`, 3072 dimensoes, persistidos como `halfvec`.
- pgvector para armazenamento e recuperacao; nao existe banco vetorial separado.

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
- `operations`: the log. `workspace_id`, monotonic `seq` per workspace, `actor_id` (o humano que autorizou a operacao), `op` (jsonb), `applied_at`. A proveniencia de IA fica em `operation_groups.source = "ai"`, nunca em um `actor_id` artificial de IA.
- `public_page_links`: one revocable public read-only UUID token per published page.
- `object_deletion_jobs`: transactional outbox for retryable S3 cleanup after permanent deletion.
- `block_embeddings`: `block_id`, `workspace_id`, `embedding` (`halfvec(3072)`), `content_hash`, `embedded_at`. Indice HNSW de cosseno; `content_hash` torna a atualizacao idempotente.
- `block_embedding_jobs`: outbox coalescente de embeddings, com lease, hash, tentativas e backoff.
- `operation_groups`: proveniencia e ordem de uma escrita agrupada; operacoes de IA guardam `runId`, acao e modelo.
- `ai_conversations`, `ai_messages`, `ai_runs`, `ai_usage_events`: historico privado, execucoes e uso da IA.
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
2. The queue sends ops over HTTP in order; the WebSocket is the broadcast lane.
3. The server authorizes, resolves conflicts (below), persists the block change and the op row in one transaction, assigns the next per-workspace `seq`, and acks with `{op_id, seq}`.
4. The server broadcasts the op to every other subscriber of that workspace/page.
5. Remote clients apply incoming ops; the sender ignores its own echo by `op_id`.

Conflict resolution: last-writer-wins per block property. Each property carries a version counter; an `update` op includes the version it saw, and the server keeps the write with the highest version (server arrival order breaks ties). Structural ops (`move`, `insert`) are serialized by the per-workspace transaction, so the tree never corrupts. This is deliberately not CRDT, and the README of record says so: it is the same tradeoff Notion made.

Recovery: after the WebSocket `hello`, the client fetches everything after its last contiguous `seq` from `GET /workspaces/{id}/operations?after_seq=`. It freezes the first `latest_seq`, paginates with `up_to_seq`, and buffers live events until every preceding sequence is present. HTTP ACKs do not advance the delivery cursor. Idempotency: `op_id` is unique; replays are acked without reapplying.

Measurable outcomes:

- Two clients issuing interleaved ops converge to byte-identical page trees (e2e test).
- A client offline for N ops recovers all N from its cursor (e2e test).
- Duplicate op delivery does not double-apply (gate test).
- Local echo never waits on the network.

## Real-Time Collaboration Design

- One WebSocket per client, subscriptions per workspace with page-level filtering server-side.
- Broadcast fan-out happens in-process in v1 (single backend instance). The documented scale path is a pub/sub layer (Redis or NATS) between backend instances; nothing in the protocol changes.
- Presence (page avatars + block focus) rides the same workspace WebSocket as ops (`presence` client msgs; snapshot/update/leave from server). Avatars use MinIO locally / Railway S3 bucket in prod.

Measurable outcomes:

- Remote edit visible in a second browser in under 2 seconds (e2e test with two Cypress-driven sessions or one browser plus an API-driven actor).

## Permissions Design

- Workspace membership gates everything in v1: owner/editor write, viewer reads, and non-members see nothing.
- Public page links grant read-only access to one page and its non-page descendants via a UUID token. They are revocable and return the same 404 for invalid, revoked, trashed, or deleted content.
- Every read path passes through the same authorization check: page fetch, search, sync feed, embeddings query, AI context assembly. One function, used everywhere, tested everywhere.

Measurable outcomes:

- Cross-workspace reads fail in browse, search, sync, public links, and AI answers (e2e coverage for each path).

## Search Design

Two lanes, one database:

- Lexical (shipped in M4): PostgreSQL full-text search (`tsvector` over title/text/caption, concurrent partial GIN index), for "find the page called X".
- Semantic: pgvector similarity over `block_embeddings`, for "where did we discuss Y", and as the retrieval layer for AI Q&A.

Both queries filter by workspace membership inside the SQL, not in application code after the fact.

Measurable outcomes:

- Search returns nothing from workspaces the user does not belong to (gate + e2e + `make eval-m4`).
- A block is excluded when it or any ancestor is trashed.
- Embedding refresh lag is observable (metric: blocks pending embedding).

## IA entregue (M5 concluido)

O adaptador implementado e OpenRouter. O chat padrao e `openai/gpt-5.6-luna`; embeddings usam obrigatoriamente `openai/text-embedding-3-large` em 3072 dimensoes, armazenados em `HALFVEC(3072)` com indice HNSW de cosseno. A API, SSE, limites e variaveis estao em [`docs/api/ai.md`](./docs/api/ai.md); schema e outbox em [`docs/database.md`](./docs/database.md).

Principios aplicados:

**1. IA e cliente do sync engine.** As acoes de escrita chamam `apply_operations`; cada op passa pelo mesmo apply, autorizacao, transacao e broadcast de uma escrita humana. `actor_id` continua sendo o humano que autorizou a execucao; o grupo registra `source: "ai"` e a proveniencia. A escrita recebe `operation_group` e `last_seq`, para que o cliente feche o grupo de undo somente depois de observar todas as operacoes.

**2. Contexto e montado, nao despejado.** O builder deterministico prioriza pedido, pagina/selecao, ancestrais e recuperacao semantica, em limite conservador de 8000 caracteres. E uma estimativa deterministica por caracteres, nao uma contagem por tokenizer. Documentos sao marcados como conteudo nao confiavel. A consulta vetorial aplica membership no SQL antes de selecionar vizinhos e exclui ancestrais na lixeira.

**3. Escopo e ferramentas sao impostos.** Continue, resumo e transformacao recebem ferramentas de leitura e `apply_operations`, validada contra o escopo da acao. Q&A funciona como harness iterativo: prioriza paginas mencionadas por `@`, abre a pagina atual, segue links com `read_page`, refaz buscas permissionadas com `search_workspace`, usa o historico recente e continua ate a resposta final ou ate esgotar oito rodadas de ferramentas. Nao pode escrever e so aceita citacoes acumuladas por leituras autorizadas; valores explicitos como `responda com 43` precisam aparecer na resposta final. Os testes unitarios cobrem parsing de stream, limites, contexto cycle-safe, ferramentas e vetores.

As quatro acoes implementadas:

- Continue writing: insercoes apos o anchor, uma por commit.
- Summarize page: um `insert_block` callout no indice 0.
- Transform selection: alteracoes/substituicoes apenas nas raizes selecionadas, em lote atomico.
- Workspace Q&A: recuperacao via pgvector e citacoes de blocos autorizados; somente leitura.

Evidencia verificada em 2026-07-14: `make eval-m5` passou; o eval pago `docs/evals/m5-live.mjs` passou 4/4 com `openai/gpt-5.6-luna` e `openai/text-embedding-3-large` (18.075 tokens de prompt e 1.145 de conclusao), cobrindo resumo, continue com duas insercoes ordenadas, transformacao e Q&A que segue a pagina filha `X` ate encontrar e citar a nota com resposta `43`, alem de acesso, negacao a nao membro, uso/proveniencia e undo por operacoes inversas. `m5-ai.cy.ts` passou 1/1 com dois clientes `EditorPage` reais, insercoes progressivas ordenadas, colaboracao WebSocket, undo agrupado, deletes inversos e convergencia persistida sem reload de snapshot.

## Railway Deployment Plan

Recommended Railway resources:

- Backend service: Rust API + WebSocket.
- Frontend service: Next.js app.
- PostgreSQL service with `CREATE EXTENSION vector` run by the first migration.
- Worker service: S3 deletion outbox now; embeddings, compaction, and reconciliation in later milestones.

Required deployment behavior:

- `/health` returns healthy only when Postgres is reachable and the pgvector extension is present.
- Frontend reads the deployed API base URL from configuration.
- Backend le configuracao por variaveis de ambiente. IA usa `OPENROUTER_API_KEY` e, opcionalmente, `OPENROUTER_BASE_URL`; `AI_CHAT_MODEL` (default `openai/gpt-5.6-luna`), `AI_TITLE_MODEL` (default `deepseek/deepseek-v4-flash`) e `AI_EMBEDDING_MODEL` (obrigatoriamente `openai/text-embedding-3-large`) selecionam os modelos. O worker aceita `EMBEDDING_BATCH_SIZE`, `EMBEDDING_DIMENSIONS=3072` e `WORKER_INTERVAL_SECONDS`.
- Database migrations run through a controlled command.
- Every release gets a smoke test: sign in, create a page, type a block, see it from a second session, run one AI action.

One WebSocket caveat to verify early: Railway supports WebSockets, but confirm proxy timeout behavior with a heartbeat ping so idle editors do not silently disconnect.

Initial deployment status:

- Project: `notion-clone` (same workspace and shape as `drive-clone`).
- API URL: `https://api-production-30a6.up.railway.app`.
- Web URL: `https://web-production-ec9b1.up.railway.app`.
- API service source: `IsraelAraujo70/notion-clone`, branch `main`, root `/backend`, Dockerfile build, healthcheck `/health`.
- Web service source: `IsraelAraujo70/notion-clone`, branch `main`, root `/frontend`, Dockerfile build (`output: "standalone"`), serving on port 8080.
- Worker service source: `IsraelAraujo70/notion-clone`, branch `main`, root `/backend`, start command `notion-clone-worker` (processes permanent-delete S3 cleanup with retry).
- Postgres: `ghcr.io/railwayapp-templates/postgres-ssl:18` (ships pgvector 0.8.4); `DATABASE_URL` is referenced into api and worker.
- Migrations `0001`–`0014` incluem pgvector, M4 e as tabelas/indice HNSW de IA e embeddings. As migracoes `0012`–`0014` foram aplicadas com sucesso em PostgreSQL 17/pgvector 0.8.4.
- Deploy smoke: `/health` 200, web `/` 200, API signup creates the user, workspace, and root page.

The api healthcheck lives on the service instance, not in `backend/railway.json`, because that file is shared with the worker (same `/backend` root) and the worker serves no HTTP.

## Roadmap

### M1: Local block editor — DONE (2026-07-08)

Deliver: block tree state, contenteditable-per-block editor, slash menu, markdown shortcuts, indent/outdent, drag reorder, undo via inverse ops. All in-memory, no server.

Done when: a page with every block type can be written keyboard-only, and undo/redo is exact.

Status: shipped. Engine in `frontend/lib/engine/` (op apply returns inverse ops; seeded 200-op fuzz proves invariants and exact full-undo), editor UI in `frontend/components/editor/`. The fuzz caught a real design bug: soft-delete must remove the id from the parent's `content` (ghost slots shift move indexes during undo) — hence `trashedIndex` in the contract. Auth + workspaces landed early via the starter rebase (signup creates a "Pessoal" workspace transactionally).

### M2: Persistence and pages — DONE (2026-07-08)

Deliver: `blocks` table, page subtree API, sidebar tree, breadcrumbs, the five op types applied through the server, trash/restore. (Auth and workspaces already landed with the starter rebase.)

Done when: a page survives a refresh and trash/restore keeps subtrees intact.

Status: shipped. Pages live at `/dashboard/pages/[pageId]`; `/dashboard` redirects to the workspace's root page, which is created in the same transaction as the workspace. The five operations go through `POST /workspaces/{id}/operations`, applied by a Rust mirror of the TS engine (`backend/src/domain/block.rs`) inside one transaction that locks the workspace row. `operations` already carries the monotonic per-workspace `seq` and the idempotent `op_id`, so M3 only has to add transport. Trash lists the roots of trashed subtrees; restore reinserts at `trashedIndex` (clamped) and brings the descendants back. Right-clicking a sidebar page renames it or moves it to the trash, and a page can carry an emoji icon — all three are the same `update_block` / `delete_block` on the page block, with no page-specific endpoint. A child page inside a parent page renders as a navigable link, never as inline content, and the subtree fetch stops there. Protocol and limits: [`contracts/README.md`](./contracts/README.md); API: [`docs/api/pages.md`](./docs/api/pages.md).

Two bugs the work surfaced. Editor mutations (undo stack, outgoing queue) used to run inside a `setState` updater, which React StrictMode double-invokes — the M1 Cypress undo assertion was passing *because of* the double undo. State now lives in a ref and the updater is pure. Second: the op queue sent one request per keystroke, so it coalesces pending `update_block`s by the same key while never touching the operation already in flight.

### M3: Sync and real-time — DONE (2026-07-14)

Deliver: WebSocket transport, cursor catch-up (`GET /workspaces/{id}/operations?after_seq=`), property-level LWW, reconnection recovery. Writes stay on HTTP POST (op queue); after commit the server broadcasts on the workspace socket. The op log, `seq`, `op_id` idempotency, and client queue were already in M2.

Done when: two browsers editing the same page converge, and a disconnected client catches up from its cursor.

Status: shipped. Hub in-process (`application/realtime`); `WS /workspaces/{id}/ws?token=`; LWW on `blocks.prop_versions` mirrored in Rust + TS engines. Catch-up starts only after `hello`, paginates to a stable snapshot, buffers out-of-order live events, and never advances its delivery cursor from a write ACK. Alem do gate de 501 operacoes, `frontend/cypress/e2e/m3-sync.cy.ts` passa 2/2: dois `EditorPage` reais convergem e uma reconexao bloqueada recupera faixa contigua sem reload. Protocol: [`docs/api/sync.md`](./docs/api/sync.md).

### M4: Membership, permissions, search — DONE (2026-07-10)

Deliver: invite by email, workspace scoping on every read path, public read-only page links, full-text search, permission e2e suite.

Done when: cross-workspace access fails everywhere and search finds only what it should.

Status: shipped. Owner/editor/viewer enforcement covers pages, writes, search, sharing, and permanent deletion. `GET /search` runs permission filtering and trashed-ancestor filtering inside PostgreSQL. Owner and editor can publish one page through a revocable read-only link; child pages are omitted, and trash revokes links transactionally. Permanent deletion removes the DB subtree and queues image keys for retryable worker cleanup. Protocol: [`docs/api/m4.md`](./docs/api/m4.md). Proof: 49 Rust tests, 149 frontend tests, 16 Cypress scenarios, `make eval-m4` against Postgres + MinIO, and `make eval-editor-sidebar-ux` for the editor/sidebar UX.

### M5: AI — DONE (2026-07-14)

Entregue e verificado: contrato OpenRouter, contexto deterministico, conversas/runs/uso, quatro acoes com ferramentas e escopo imposto, grupos de operacoes, worker/outbox de embeddings e recuperacao semantica com filtro de permissao. `make eval-m5` passou; o eval pago ao vivo passou 4/4 e o Cypress `m5-ai.cy.ts` passou 1/1 com dois clientes reais. Documentacao: [`docs/api/ai.md`](./docs/api/ai.md), [`docs/database.md`](./docs/database.md) e [`docs/evals/README.md`](./docs/evals/README.md).

O smoke final de deploy/Railway, inclusive uma acao de IA no ambiente publicado, pertence ao M6.

### M6: Hardening and deploy

Deliver: smoke final de Railway (incluindo IA), worker jobs, observability, load sanity checks on op apply and subtree fetch, architecture diagram, failure-mode notes, demo script.

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

# Postgres+pgvector + Rust API in Docker; Next.js on the host via npm:
make dev

# URLs:
# Web: http://localhost:3000   (npm run dev)
# API: http://localhost:18080/health
# Postgres: localhost:55433 (db notion_clone)

# Backend only (no Next process):
make backend
```


`make test` runs the Rust (`cargo test --lib --bins`) and Vitest gates; `make test-e2e` runs Cypress against the composed stack. `make eval-page-persistence` drives the block API end to end; `make eval-sync-catch-up` proves recovery beyond the 500-op page limit; `make eval-m4` proves role enforcement, search isolation, public-link lifecycle, purge, and MinIO cleanup. `make eval-editor-sidebar-ux` proves the multiline highlighted code editor, persisted sidebar width, and legible deep page trees in a real browser. `make eval-m5` is the deterministic AI gate; `docs/evals/m5-live.mjs` is the opt-in paid live eval.

## Current Status

M4 done (2026-07-10): global full-text search is scoped by membership and excludes trashed ancestry; public pages are single-page, read-only, revocable, and private by default; owner/editor can permanently delete a trash root while the worker reliably cleans up S3 objects. The local full-stack proof is 16/16 Cypress scenarios plus the M4 Postgres/MinIO eval and the editor/sidebar UX eval.

M5 done (2026-07-14): `make eval-m5` passou; o eval pago ao vivo passou 4/4 com `openai/gpt-5.6-luna` e `openai/text-embedding-3-large` (18.075 prompt, 1.145 completion tokens), incluindo a busca iterativa `pagina atual -> X -> nota -> 43`; e `m5-ai.cy.ts` passou 1/1 com dois `EditorPage` reais. A prova cobre escrita progressiva colaborativa, undo agrupado por operacoes inversas, persistencia/convergencia sem reload, Q&A com citacoes autorizadas, proveniencia, uso e negacao a nao membro. Backend: 90 testes de lib + 2 de worker, `cargo fmt` e `cargo check` passaram. Frontend: 214 testes, lint sem warnings, typecheck e build de producao passaram. A suite Cypress fechou 21/21 apos a repeticao direcionada do `m5-ai.cy.ts`; `editor.cy.ts` passou 11/11 com debounce e marquee. O drag multiplo manual gerou duas `move_block`, nenhum delete e persistiu apos reload.

M3 done (2026-07-14): real-time sync. Dois clientes `EditorPage` reais convergem e uma reconexao recupera a faixa contigua congelada sem reload (`m3-sync.cy.ts`, 2/2). Property-level LWW is enforced on both engines; structural ops stay serialized by the workspace lock.

M2 done (2026-07-08): pages are rows in `blocks`, edited only through the five typed operations. Nested pages, breadcrumbs, sidebar tree, and trash/restore round-trip through Postgres. Writes are serialized per workspace, idempotent by `op_id`, and numbered by a monotonic `seq`.

M1 done (2026-07-08): in-memory block editor with every block type, slash menu, markdown shortcuts, indent/outdent, drag reorder, and exact undo/redo via inverse ops.

Next: M6 — smoke final de deploy/Railway com IA, observabilidade, carga, CI, diagramas e documentacao de falhas. MCP/API publica para agentes externos continua sendo extensao futura.
