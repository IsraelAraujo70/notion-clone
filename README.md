# Reason

Reason is a collaborative workspace for writing and organizing block-based documents. Pages, text, lists, images, and subpages form a tree, and every change becomes a persisted, synchronized operation. The product has web and Android clients built on the same protocol.

**Production:** [reason.israeldeveloper.com.br](https://reason.israeldeveloper.com.br)

## Current Features

- Sign-up, sessions, profiles, workspaces, invitations, and access roles.
- Block editor with inline Markdown, keyboard shortcuts, a slash menu, reordering, indentation, undo/redo, and nested pages.
- Persistence, trash and restore, revocable public links, and page transfers between workspaces.
- Optimistic updates, WebSocket collaboration, and cursor-based recovery after disconnection.
- Workspace-scoped full-text search.
- AI actions for continuing, summarizing, and transforming content, plus semantic Q&A with citations and a full-workspace assistant that can read, search, create, and edit pages.
- Reviewable AI writes with typed operation previews, `Allow once` or conversation-scoped approval, persistent conversation selection, and grouped tool/change activity in the chat timeline.
- Authenticated MCP access for agents to read, search, and edit blocks, as well as retrieve images.
- Inline databases with JSONB-backed dynamic properties, resizable columns, shared table/Kanban views, and rows that open as subpages.
- Desktop page tabs with local per-user/workspace persistence, deep-link restoration, drag reordering, and a fixed AI tab; mobile keeps single-page navigation.

The current version does not include GitHub Issues synchronization, a released desktop or offline client, or page-level permissions. An experimental Electron shell lives in `desktop/` while the desktop architecture is validated.

## Technical Principles

1. **Everything is a block.** A page is a block with children. `content` defines ordering, while `parentId` defines membership.
2. **Every write is an operation.** The frontend and backend apply the same rules, with idempotency, per-workspace cursors, and per-property LWW semantics.
3. **AI has no shortcut.** AI writes go through the same authorization, transactions, operation log, synchronization, and undo flow as human writes. Operations are proposed before persistence and require either an individual decision or an explicit approval scoped to the current user, workspace, and conversation.

## Architecture

The Next.js frontend applies changes locally. The Rust API authorizes, validates, and persists operations in PostgreSQL. WebSocket distributes changes, while SSE streams AI text, tool activity, operation proposals, decisions, usage, and completion. The frontend restores the active private conversation and its grouped activity during the application session. A worker processes embeddings and file cleanup. PostgreSQL also provides full-text search and vector storage through pgvector.

```text
Browser / Electron ── HTTP / WebSocket / SSE ── API Rust ── PostgreSQL + pgvector
                                                    └────── worker / S3 storage
```

Architecture decisions and boundaries are documented in [docs/arquitetura.md](docs/arquitetura.md).

## Local Development

Prerequisites: Docker Desktop, Node.js 22.12 or newer, and npm. Rust is only required to run Cargo commands outside the container.

```bash
cp .env.example .env
make dev
```

`make dev` starts PostgreSQL, MinIO, the API, and the worker in Docker, and runs Next.js on the host machine.

- Web: `http://localhost:3000`
- API: `http://localhost:18080`
- PostgreSQL: `localhost:55433` (`notion_clone`)
- MinIO: `http://localhost:9000`

Use `make backend` when you do not need the frontend.

### Mobile

The Expo client in `mobile/` uses the production API by default. To point it to another API:

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

On an Android device, a local API must use the machine's reachable IP address instead of `localhost`. To generate an internal APK, configure EAS and run `eas build --profile preview --platform android`.

The `Android beta` workflow builds an APK with GitHub Actions and publishes the `reason-beta.apk` asset to the fixed `android-beta` release. The landing page points to this asset by default; set `NEXT_PUBLIC_ANDROID_APK_URL` to override the URL.

### Desktop spike

The Electron spike loads the local web app by default and keeps the renderer sandboxed without Node access. Install its dependencies once, then start the complete local stack with one command:

```bash
npm --prefix desktop install
make desktop
```

`make desktop` starts the same backend services as `make dev`, starts or reuses Next.js on port `3000`, and opens Electron at `/dashboard`. Existing sessions restore their locally persisted page tabs or enter the fixed Reason AI tab; unauthenticated sessions are redirected to `/login`, so the desktop app never starts on the marketing landing page. Only the active page editor is mounted. The packaged app and desktop window use the standalone Reason mark from `frontend/app/icon.svg`. Use `cd desktop && REASON_WEB_URL=https://reason.israeldeveloper.com.br npm start` to exercise only the production origin. The decision and manual validation checklist are in [docs/adr/desktop-electron.md](docs/adr/desktop-electron.md).

## Verification

```bash
make test       # Rust + shared core + web/mobile + desktop security tests
make test-e2e   # Cypress against the full stack
make down       # Stop the local environment
```

See [docs/testes.md](docs/testes.md) for details about what each gate covers.

## Documentation

- [Architecture](docs/arquitetura.md)
- [Block and operation protocol](docs/protocolo.md)
- [API](docs/api.md)
- [MCP](docs/mcp.md)
- [Tests and gates](docs/testes.md)
- [Desktop Electron ADR](docs/adr/desktop-electron.md)
