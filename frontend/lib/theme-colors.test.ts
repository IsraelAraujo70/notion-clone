import { describe, expect, it } from "vitest"

import { APP_THEME_DEFINITIONS } from "./theme"

describe("theme colors", () => {
  it("keeps default theme Notion-like", () => {
    const light = APP_THEME_DEFINITIONS.default.light.tokens
    const dark = APP_THEME_DEFINITIONS.default.dark.tokens

    expect(light.background).toBe("#fbfaf8")
    expect(light.foreground).toBe("#37352f")
    expect(light.card).toBe("#ffffff")
    expect(light.border).toBe("#e9e9e7")
    expect(light.sidebar).toBe("#f7f7f5")

    expect(dark.background).toBe("#191919")
    expect(dark.foreground).toBe("#e6e6e6")
    expect(dark.card).toBe("#202020")
    expect(dark.border).toBe("#373737")
    expect(dark.sidebar).toBe("#202020")
  })

  it("keeps GitHub dark mode GitHub-like", () => {
    const tokens = APP_THEME_DEFINITIONS.github.dark.tokens

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

  it("keeps evergreen blue-green in both modes", () => {
    const tokens = APP_THEME_DEFINITIONS.evergreen.light.tokens
    const darkTokens = APP_THEME_DEFINITIONS.evergreen.dark.tokens

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

    expect(darkTokens.background).toBe("#0d1f1c")
    expect(darkTokens.foreground).toBe("#d7ede7")
    expect(darkTokens.primary).toBe("#5eead4")
  })

  it("keeps every theme mode on the same token contract", () => {
    const expectedTokenNames = Object.keys(
      APP_THEME_DEFINITIONS.default.light.tokens
    ).sort()

    for (const theme of Object.values(APP_THEME_DEFINITIONS)) {
      expect(Object.keys(theme.light.tokens).sort()).toEqual(expectedTokenNames)
      expect(Object.keys(theme.dark.tokens).sort()).toEqual(expectedTokenNames)
    }
  })
})
