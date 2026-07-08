# Notion Clone Web

Next.js App Router frontend for Notion Clone. It ships with a public landing
page, signup/login/reset-password forms, protected dashboard shell, Notion-style
sidebar navigation, command palette, local in-memory block editor, Tailwind CSS,
and shadcn/ui.

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
