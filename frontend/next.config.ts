import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

// Força o root do Turbopack em `frontend/`. Sem isso, um package-lock na
// raiz do monorepo faz o Next varrer backend/ + node_modules da raiz e o
// dev vira um monstro de memória.
const frontendRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  allowedDevOrigins: ["web-e2e"],
  output: "standalone",
  turbopack: {
    root: frontendRoot,
  },
}

export default nextConfig
