import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

function readThemeTokens(pattern: RegExp, label: string) {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const css = readFileSync(resolve(currentDir, "../app/globals.css"), "utf8")
  const themeBlock = css.match(pattern)?.[1]

  if (!themeBlock) {
    throw new Error(`Missing ${label} theme block`)
  }

  return Object.fromEntries(
    Array.from(themeBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)).map(
      ([, name, value]) => [name, value.trim()]
    )
  )
}

function readThemeBlock(pattern: RegExp, label: string) {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const css = readFileSync(resolve(currentDir, "../app/globals.css"), "utf8")
  const themeBlock = css.match(pattern)?.[1]

  if (!themeBlock) {
    throw new Error(`Missing ${label} theme block`)
  }

  return themeBlock
}

describe("theme colors", () => {
  it("keeps dark mode GitHub-like", () => {
    const tokens = readThemeTokens(/\.dark\s*\{([^}]+)\}/, ".dark")
    const block = readThemeBlock(/\.dark\s*\{([^}]+)\}/, ".dark")

    expect(block).toContain("color-scheme: dark")

    expect(tokens.background).toBe("#0d1117")
    expect(tokens.foreground).toBe("#c9d1d9")
    expect(tokens.card).toBe("#161b22")
    expect(tokens.border).toBe("#30363d")
    expect(tokens.muted).toBe("#21262d")
    expect(tokens["muted-foreground"]).toBe("#8b949e")
    expect(tokens.primary).toBe("#58a6ff")
    expect(tokens.sidebar).toBe("#010409")
    expect(tokens["sidebar-foreground"]).toBe("#c9d1d9")
  })

  it("keeps evergreen blue-green and light", () => {
    const tokens = readThemeTokens(
      /\[data-theme="evergreen"\]\s*\{([^}]+)\}/,
      "evergreen"
    )
    const block = readThemeBlock(
      /\[data-theme="evergreen"\]\s*\{([^}]+)\}/,
      "evergreen"
    )

    expect(block).toContain("color-scheme: light")

    expect(tokens.background).toBe("#f5fbf8")
    expect(tokens.foreground).toBe("#102522")
    expect(tokens.card).toBe("#ffffff")
    expect(tokens.border).toBe("#c7ddd5")
    expect(tokens.muted).toBe("#e8f4ef")
    expect(tokens["muted-foreground"]).toBe("#55716a")
    expect(tokens.primary).toBe("#0f766e")
    expect(tokens.ring).toBe("#0e7490")
    expect(tokens.sidebar).toBe("#dceee8")
    expect(tokens["sidebar-foreground"]).toBe("#102522")
  })
})
