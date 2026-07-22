import { copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

const grammars = [
  "bash",
  "c",
  "c_sharp",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "php",
  "python",
  "ruby",
  "rust",
  "toml",
  "tsx",
  "typescript",
  "yaml",
]

const root = process.cwd()
const output = join(root, "public", "tree-sitter")
await mkdir(output, { recursive: true })

await copyFile(
  join(root, "node_modules", "web-tree-sitter", "tree-sitter.wasm"),
  join(output, "web-tree-sitter.wasm")
)

await Promise.all(
  grammars.map((grammar) =>
    copyFile(
      join(
        root,
        "node_modules",
        "tree-sitter-wasms",
        "out",
        `tree-sitter-${grammar}.wasm`
      ),
      join(output, `tree-sitter-${grammar}.wasm`)
    )
  )
)
