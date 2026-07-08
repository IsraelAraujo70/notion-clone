# Notion Clone Web

Next.js App Router frontend for Notion Clone. It ships with a public landing
page, signup/login/reset-password forms, protected dashboard shell, Notion-style
sidebar page tree, command palette, trash/restore, and a server-backed block
editor, on Tailwind CSS and shadcn/ui.

Pages live at `/dashboard/pages/[pageId]`; `/dashboard` redirects to the active
workspace's root page. Every edit is applied optimistically to the local block
tree, then sent as a typed operation to `POST /workspaces/{id}/operations`
through a sequential queue (`lib/engine/op-queue.ts`). Typing bursts coalesce
into one request per round trip; a rejected operation stops the queue and the
editor offers to reload the server state.

## Develop

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000` and reads
`NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:8080`.

## Validate

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```
