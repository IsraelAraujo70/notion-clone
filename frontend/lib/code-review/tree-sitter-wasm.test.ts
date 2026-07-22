import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { Language, Parser } from "web-tree-sitter"

describe("Tree-sitter WASM compatibility", () => {
  it("loads and parses with the bundled TSX grammar", async () => {
    await Parser.init()
    const language = await Language.load(
      join(
        process.cwd(),
        "node_modules/tree-sitter-wasms/out/tree-sitter-tsx.wasm"
      )
    )
    const parser = new Parser()
    parser.setLanguage(language)
    const tree = parser.parse("export const View = () => <div>Reason</div>")

    expect(tree?.rootNode.hasError).toBe(false)

    tree?.delete()
    parser.delete()
  })
})
