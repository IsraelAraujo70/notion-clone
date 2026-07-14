# Notion Clone Challenge

## Context

You are going to design and build a collaborative workspace product inspired by Notion.

The goal is to practice software architecture, backend development, frontend product design, real-time systems, AI integration, deployment, testing, and documentation. This is a portfolio challenge, so the final result should be understandable to another engineer, demonstrable in a browser, and supported by clear evidence that the hardest behaviors work.

Do not treat this challenge as a UI-only clone. The project must include a real block data model, a real operation-based sync engine, real-time collaboration, real permission handling, and an AI integration that writes through the same code path as a human user. A text editor with a sidebar is a costume. This challenge is the thing underneath.

## Product Goal

Build a web application where users create workspaces, write documents composed of blocks, organize pages into arbitrary hierarchies, collaborate in real time, search their content, and use AI that reads and writes that content natively.

The product should support a realistic first version while also explaining how the architecture could evolve toward a large-scale collaborative workspace, including a future desktop client with a local replica.

## Functional Requirements

### 1. Block Editor

Everything the user writes is a block. There is no separate "document body": a page is a block whose children are blocks.

The product should support:

- Block types: paragraph, heading 1-3, bulleted list item, numbered list item, to-do, toggle, quote, code, callout, and divider.
- Creating a block by pressing Enter and deleting by merging with Backspace.
- A slash command menu to insert or change block types.
- Turning any block into any other compatible type in place.
- Indenting and outdenting blocks, which reparents them in the block tree.
- Reordering and moving blocks by drag.
- Markdown-style shortcuts (`#`, `-`, `[]`, `>`, backticks).
- Optimistic local behavior: no keystroke or block operation waits on the network.

### 2. Pages and Hierarchy

Pages are blocks too, so pages nest arbitrarily.

The product should support:

- Creating pages inside pages with no depth limit.
- A sidebar tree of the workspace's pages.
- Moving a page to a different parent.
- Breadcrumbs reflecting the page's position in the tree.
- Page titles and icons as block properties.

### 3. Sync Engine

Every edit is an explicit, typed operation. This is the backbone of the whole product.

The product should define:

- The operation schema: insert block, update block properties, move block, delete block, restore block.
- How operations apply locally first, then queue, then reach the server.
- How the server orders operations into a per-workspace log with a monotonic cursor.
- How a client that disconnects recovers by pulling operations from its last cursor.
- How duplicate delivery is handled (idempotency).
- How conflicts resolve. Last-writer-wins at the block-property level is acceptable, but it must be documented, deliberate, and tested.

### 4. Real-Time Collaboration

Two users editing the same page must see each other's changes without refreshing.

The product should support:

- Subscribing to a page or workspace over a persistent connection.
- Broadcasting applied operations to other subscribed clients.
- Remote changes appearing within a couple of seconds under normal conditions.
- Deterministic convergence: after the dust settles, all clients show the same content.
- Presence (who else is viewing the page) as an optional extension.

### 5. Sharing and Permissions

The product should define:

- Workspace membership: inviting a registered user by email, removing a member.
- What members can see and edit (v1 may scope permissions at the workspace level).
- Public read-only page links that can be revoked.
- Private-by-default behavior: content is never visible outside the workspace unless explicitly shared.
- Permission checks on every read path, including search, sync, and AI context assembly.

### 6. Search

Users must be able to find content across everything they can access.

The product should support:

- Full-text search over page titles and block content.
- Results scoped strictly to the user's accessible workspaces.
- Excluding trashed content unless explicitly requested.
- Returning enough metadata to jump to the exact page.

### 7. Trash and Restore

The product should support:

- Deleting a block or page subtree to trash (soft delete).
- Restoring from trash with the subtree intact.
- Permanent deletion.
- Trashed content disappearing from browse, search, sync feeds for other clients, and AI context.

### 8. AI Integration

This is the flagship requirement. The point is to demonstrate what a real AI integration looks like, as opposed to a chat panel bolted onto the side.

The product must enforce three principles:

1. **The AI is a client of the sync engine.** When the AI writes, it emits the same typed operations a user would, through the same code path. Its output streams into the page block by block, is undoable with the same undo system, is visible to collaborators in real time, and is auditable in the operation log. There is no second write path.
2. **Context is assembled, not dumped.** A deterministic, testable context builder receives the current block position and the task, and assembles: the serialized page subtree, ancestor context, and semantically relevant blocks from across the workspace, all within an explicit token budget.
3. **Quality is measured.** The LLM sits behind one typed internal contract. Context assembly has deterministic tests. Output quality has an eval suite with pass thresholds that run before ship.

Minimum AI features:

- Continue writing: insert new blocks below the cursor in the page's style.
- Summarize page: read the subtree, insert a summary block at the top.
- Transform selection: turn selected blocks into another structure (for example bullets into a table or a paragraph into a list).
- Workspace Q&A: answer questions using semantic search over the user's accessible content, citing source blocks the user can click.

Semantic search requirements:

- Block embeddings stored in PostgreSQL with pgvector. No separate vector database.
- Embeddings updated asynchronously by a worker when content changes.
- Vector queries filtered by the requesting user's permissions in the same query.

## Non-Functional Requirements

Design the system with these long-term scale targets in mind:

- 10 million registered users.
- 1 million monthly active workspaces.
- 1 billion blocks.
- 10 million block operations per day.
- 100,000 concurrent real-time connections.

The system must also be designed for:

- Local editor echo under one frame; remote propagation under 2 seconds.
- High availability.
- Fault tolerance, including client reconnection recovery.
- Secure authorization on every read and write path.
- Clear observability.
- Deployability to a real cloud environment.

The architecture documentation must explain where sharding would go (partition key and why), even though the first deployment runs a single database.

## Implementation Constraints

The project must use:

- Rust for the backend.
- TypeScript for the frontend.
- PostgreSQL with the pgvector extension as the only database. Metadata, operation log, full-text search, and embeddings all live in Postgres.
- Railway as the preferred deployment target, unless a documented blocker makes another deployment target necessary.

Product scope constraints:

- Version 1 is a web application only, so viewers can test it in a browser without installing anything. A desktop client with a local replica is a documented future direction, and the operation-based sync design must not preclude it.
- Notion-style databases (tables with views, filters, and formulas) are explicitly out of scope for version 1. Cutting this is a scope decision, not an accident, and must be stated in the README.
- All LLM access goes through one self-contained service contract. No other part of the system calls a provider directly.

## Expected Deliverables

The finished project should include:

- A deployed web application.
- Source code for the backend and frontend.
- A README explaining the chosen architecture and tradeoffs.
- Local setup instructions.
- Deployment instructions.
- API documentation, including the operation schema and the sync protocol.
- Database/schema documentation.
- Tests for core behaviors.
- End-to-end tests for multi-client convergence, permission enforcement, trash lifecycle, and the AI write path.
- An eval suite for AI output quality with documented pass thresholds.
- A short demo script or demo video outline.

## Success Criteria

The challenge is successful when:

- A user can write a page with every supported block type using only the keyboard.
- Two browsers editing the same page converge to identical content.
- A client that loses its connection recovers all missed changes from its cursor.
- Conflict resolution behaves as documented and is covered by tests.
- Private content cannot be read by non-members through browse, search, sync, public links, or AI answers.
- AI writes stream into the page as blocks, are undoable, and appear in real time for collaborators.
- Workspace Q&A cites real source blocks and respects permissions.
- Search does not leak content across workspaces.
- The app is deployed or has a clear deploy path.
- The README explains the architecture well enough for another engineer to review it.
- The tests and evals provide evidence that the most important behaviors work.

## Current Implementation Status

Last updated: 2026-07-14.

Overall status: M1–M5 estao concluidos; somente M6 permanece parcial. A evidencia final de M5 inclui `make eval-m5`, o eval pago `docs/evals/m5-live.mjs` 4/4 com `openai/gpt-5.6-luna` e `openai/text-embedding-3-large` (18.075 tokens de prompt e 1.145 de conclusao), e `frontend/cypress/e2e/m5-ai.cy.ts` 1/1 com dois `EditorPage` reais. Ela prova resumo, continue com duas insercoes ordenadas, transformacao, Q&A iterativo que segue a pagina filha `X` e encontra `43` na primeira pergunta, citacoes e controle de acesso, negacao a nao membro, uso/proveniencia, undo por operacoes inversas, colaboracao WebSocket e convergencia persistida sem reload. Tambem passaram 90 testes Rust de lib, 2 de worker, `cargo fmt` e `cargo check`; 214 testes frontend, lint sem warnings, typecheck e build de producao; 21 cenarios Cypress apos repeticao direcionada do M5; e drag multiplo manual persistido sem deletes. As migracoes 0012–0014 foram aplicadas em PostgreSQL 17/pgvector 0.8.4 com HNSW. O smoke final de deploy/Railway com IA e trabalho de M6.
