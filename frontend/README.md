# Notion Clone Web

Next.js App Router frontend for Notion Clone. It ships with a public landing
page, signup/login/reset-password forms, protected dashboard shell, Notion-style
sidebar page tree, command palette, trash/restore, and a server-backed block
editor, on Tailwind CSS and shadcn/ui.

Pages live at `/dashboard/pages/[pageId]`; `/dashboard` redirects to the active
workspace's root page. Every edit is applied optimistically to the local block
tree, then sent as a typed operation to `POST /workspaces/{id}/operations`
through a sequential queue (`lib/engine/op-queue.ts`). Text, title, caption, and
code updates use a 300 ms trailing debounce while remaining immediately visible
locally. Blur, structural edits, undo/redo, navigation, and AI actions flush the
pending value in order. A rejected operation stops the queue and the editor
offers to reload the server state with a fresh queue.

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

## Code editor and sidebar UX

Code blocks use CodeMirror and stay inside the normal block-operation path. They
support plaintext, JavaScript, TypeScript, JSX, TSX, HTML, CSS, JSON, Markdown,
Bash, SQL, Python, Rust, Go, Java, C#, and C++. `Enter` creates a new code line;
`Tab` and `Shift+Tab` indent it; `Shift+Enter` or `Escape` creates the next
paragraph.

Desktop block selection uses a Notion-style pointer marquee with autoscroll,
Cmd/Ctrl additive selection, Shift ranges, normalized subtree roots, and an
accessible selection announcement. Copy/cut carry both plain text and a bounded
versioned block-tree payload. Right-click and a handle click share the same
custom options menu; dragging one selected handle moves every selected root in
document order.

On desktop, the sidebar can be resized from 200px up to `min(480px, 40vw)`. Its
expanded width is saved locally, while `Cmd/Ctrl+B` and a rail click still
collapse it. Deep page trees cap their visual indentation after four levels so
page titles remain usable.

Run the browser UX eval from the repository root:

```bash
make eval-editor-sidebar-ux
```
