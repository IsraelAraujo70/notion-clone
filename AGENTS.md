# Agent Guidelines

These instructions apply to every agent that changes this repository. Read
`challenge.md`, `progress.json`, and the relevant protocol documentation before
implementing a feature. Keep `progress.json` current when a milestone changes.

## Product Invariants

- Everything users write is a block. Pages are blocks whose children are blocks.
- Every mutation uses one of the typed operations documented in
  `docs/protocolo.md`. Do not add page-specific mutation shortcuts.
- Optimistic frontend changes and backend persistence must apply the same
  operation semantics. Keep the TypeScript and Rust engines behaviorally equal.
- AI is another client of the operation engine. It must not write blocks through
  a separate repository method or direct SQL path.
- Every tenant-owned table and query is scoped by `workspace_id`.
- Authorization happens before reads and writes. Search, sync, public sharing,
  media, embeddings, and AI context must not bypass the same permission rules.
- Preserve operation idempotency by `op_id`, monotonic per-workspace `seq`, tree
  consistency, and LWW property versions.
- `content` owns child ordering and `parent_id` owns membership. Both sides of
  this invariant must change atomically.

## Frontend: Atomic Design

The frontend is Next.js and React under `frontend/`. Follow Atomic Design inside
feature directories and preserve the conventions in `frontend/components/README.md`.

- `frontend/app/` contains thin route files, layouts, and framework boundaries.
  Route files compose templates instead of implementing product workflows.
- `frontend/components/ui/` is vendored shadcn source. Do not move it into the
  atomic tree and do not wrap primitives only to rename them.
- `atoms/` contains small reusable visual elements with no product workflow.
- `molecules/` contains small product components that receive state and callbacks.
- `organisms/` contains composed product surfaces such as editors, sidebars,
  dialogs, forms, and panels.
- `templates/` composes complete route-level screens. Templates coordinate
  organisms but should not contain domain algorithms.
- Keep feature-specific components in their feature directory. Promote a
  component to a shared level only after it has a real second consumer.
- Put deterministic state transformations in `frontend/lib/`, especially editor
  behavior in `frontend/lib/engine/`. React components must not duplicate them.
- Keep transport details in `frontend/lib/api.ts` and real-time behavior in
  `frontend/lib/sync/`. Components consume those boundaries instead of issuing
  ad hoc requests.
- Keep shared protocol types in `frontend/lib/contracts.ts`, synchronized with
  `docs/protocolo.md` and the Rust domain representation.
- Prefer controlled composition and explicit props. Avoid global state,
  speculative abstractions, and hooks that mix unrelated workflows.
- Do not perform side effects inside React state updater functions. State
  updaters must remain pure under React Strict Mode.
- Keep product component modules under 350 lines and templates under 200 lines
  where practical. Split by real UI responsibility, not arbitrary file size.
- Preserve keyboard-first editing, optimistic local echo, accessibility, and
  desktop/mobile behavior when changing UI.

## Backend: Ports And Adapters

The Rust backend under `backend/src/` uses Ports and Adapters. Dependencies point
inward: adapters depend on application and domain; domain never depends on outer
layers.

### Domain

- `backend/src/domain/` contains entities, value types, operation application,
  invariants, and domain errors.
- Domain code must not import Axum, SQLx, environment configuration, HTTP DTOs,
  PostgreSQL details, object storage, email, or hosted AI clients.
- Keep business rules deterministic and testable without infrastructure.

### Application

- `backend/src/application/` contains use cases and orchestration.
- Define infrastructure dependencies as traits in
  `backend/src/application/ports/` and inject them into use cases.
- Use cases enforce permissions and sequence domain operations. They must not
  contain SQL, parse HTTP requests, read environment variables, or construct
  concrete adapters.
- Add one focused use case when behavior represents a distinct user action.
  Do not add service layers that only forward arguments.

### Adapters

- `backend/src/adapters/http/` translates HTTP/WebSocket input into use-case
  calls and maps application errors into transport responses.
- HTTP handlers stay thin. They authenticate, validate transport input, invoke a
  use case, and serialize output; they do not implement business rules.
- `backend/src/adapters/postgres/` implements repository ports and owns SQL,
  transactions, row mapping, locking, and database-specific optimization.
- Email and storage implementations stay in their adapter directories behind
  application ports.
- New external AI or embedding providers must be adapters behind an application
  port. No application or domain module may call a provider directly.

### Bootstrap

- `backend/src/bootstrap/` owns configuration, dependency construction, router
  assembly, middleware, health checks, and application state.
- Concrete adapters are selected and injected only at this composition boundary.
- `backend/src/bin/` contains process entry points. Keep API and worker business
  behavior in reusable application code or adapters.

## Data And Protocol Changes

- Treat `docs/protocolo.md` as the canonical operation protocol. Update the
  contract before or with both language implementations.
- Add forward-only SQL migrations. Never rewrite a migration that may have run in
  an environment.
- Apply related block mutation, operation-log insertion, and cursor assignment in
  one database transaction.
- Filter permission-sensitive data in SQL where required; never fetch another
  workspace's data and filter it afterward in application code.
- Keep recursive tree operations cycle-safe and preserve trash/restore subtrees.
- Do not introduce another database. PostgreSQL stores metadata, operations,
  full-text indexes, and pgvector embeddings.

## Testing And Delivery

- Add deterministic unit tests for domain rules and pure frontend logic.
- Add repository or application tests for permissions, transactions,
  idempotency, and workspace isolation.
- Add Cypress coverage for user-visible workflows and multi-client behavior.
- A bug fix must include a regression test when the behavior can be reproduced
  deterministically.
- Run the smallest relevant check while iterating, then run `make test` before
  shipping a cross-layer change.
- Use `make test-e2e` for full-stack behavior and add focused acceptance
  coverage for milestone requirements.
- Do not claim a milestone complete in `progress.json` until its acceptance
  behavior has executable evidence.

## Change Discipline

- Make the smallest change that satisfies the requirement.
- Follow existing names and module boundaries before introducing abstractions or
  dependencies.
- Do not create parallel write paths, duplicate contracts, generic repositories,
  or speculative extension points.
- Never weaken authorization, workspace scoping, operation invariants, or test
  coverage to simplify an implementation.
- Update `README.md`, API docs, contracts, and `progress.json` when behavior or
  project status changes. Describe planned architecture explicitly as planned,
  never as already shipped.
