import { describe, expect, it } from "vitest"
import {
  APP_THEME_STORAGE_KEY,
  APP_THEMES,
  PUBLIC_THEME_STORAGE_KEY,
  THEME_MODES,
  getNextMode,
  getThemeStorageKey,
  isAppTheme,
  isAppThemeRoute,
  isThemeMode,
  normalizeStoredTheme,
} from "./theme"

describe("theme scope", () => {
  it("keeps public pages on the public theme storage key", () => {
    expect(getThemeStorageKey("/")).toBe(PUBLIC_THEME_STORAGE_KEY)
    expect(getThemeStorageKey("/login")).toBe(PUBLIC_THEME_STORAGE_KEY)
    expect(getThemeStorageKey("/signup")).toBe(PUBLIC_THEME_STORAGE_KEY)
  })

  it("uses the app theme storage key inside the dashboard", () => {
    expect(getThemeStorageKey("/dashboard")).toBe(APP_THEME_STORAGE_KEY)
    expect(getThemeStorageKey("/dashboard#settings")).toBe(
      APP_THEME_STORAGE_KEY
    )
  })

  it("identifies app theme routes", () => {
    expect(isAppThemeRoute("/dashboard")).toBe(true)
    expect(isAppThemeRoute("/dashboard#settings")).toBe(true)
    expect(isAppThemeRoute("/login")).toBe(false)
  })

  it("returns the next theme mode", () => {
    expect(getNextMode("light")).toBe("dark")
    expect(getNextMode("dark")).toBe("light")
    expect(getNextMode(undefined)).toBe("dark")
  })

  it("accepts only supported app themes and modes", () => {
    expect(APP_THEMES).toEqual([
      "default",
      "github",
      "evergreen",
      "catppuccin",
      "nord",
      "gruvbox",
      "rose-pine",
      "solarized",
      "tokyo-night",
    ])
    expect(THEME_MODES).toEqual(["light", "dark"])
    expect(isAppTheme("default")).toBe(true)
    expect(isAppTheme("github")).toBe(true)
    expect(isAppTheme("evergreen")).toBe(true)
    expect(isAppTheme("tokyo-night")).toBe(true)
    expect(isAppTheme("light")).toBe(false)
    expect(isThemeMode("light")).toBe(true)
    expect(isThemeMode("dark")).toBe(true)
    expect(isThemeMode("system")).toBe(false)
  })

  it("migrates old stored theme values", () => {
    expect(normalizeStoredTheme("light", true)).toEqual({
      theme: "default",
      mode: "light",
    })
    expect(normalizeStoredTheme("dark", true)).toEqual({
      theme: "github",
      mode: "dark",
    })
    expect(normalizeStoredTheme("evergreen", true)).toEqual({
      theme: "evergreen",
      mode: "light",
    })
    expect(normalizeStoredTheme("evergreen", false)).toEqual({
      theme: "default",
      mode: "light",
    })
  })

  it("normalizes JSON theme storage", () => {
    expect(
      normalizeStoredTheme('{"theme":"github","mode":"dark"}', true)
    ).toEqual({ theme: "github", mode: "dark" })
    expect(
      normalizeStoredTheme('{"theme":"github","mode":"dark"}', false)
    ).toEqual({ theme: "default", mode: "dark" })
    expect(normalizeStoredTheme("not-json", true)).toEqual({
      theme: "default",
      mode: "light",
    })
  })
})
