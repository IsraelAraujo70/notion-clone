import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(frontendRoot, "..")

const nextConfig: NextConfig = {
  allowedDevOrigins: ["web-e2e"],
  output: "standalone",
  transpilePackages: ["@reason/core"],
  turbopack: {
    // O core compartilhado fica fora de `frontend/` e precisa estar no grafo.
    root: monorepoRoot,
    // web-tree-sitter guards these imports behind Node-only runtime checks.
    resolveAlias: {
      "fs/promises": {
        browser: "./lib/code-review/tree-sitter-node-stub.ts",
      },
      module: {
        browser: "./lib/code-review/tree-sitter-node-stub.ts",
      },
    },
  },
}

export default nextConfig
