import { describe, expect, it } from "vitest"
import {
  APP_THEME_STORAGE_KEY,
  APP_THEMES,
  PUBLIC_THEME_STORAGE_KEY,
  getNextTheme,
  getThemeStorageKey,
  isAppTheme,
  isAppThemeRoute,
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

  it("returns the next explicit theme", () => {
    expect(getNextTheme("light")).toBe("dark")
    expect(getNextTheme("dark")).toBe("evergreen")
    expect(getNextTheme("evergreen")).toBe("light")
    expect(getNextTheme(undefined)).toBe("light")
  })

  it("accepts only supported app themes", () => {
    expect(APP_THEMES).toEqual(["light", "dark", "evergreen"])
    expect(isAppTheme("light")).toBe(true)
    expect(isAppTheme("dark")).toBe(true)
    expect(isAppTheme("evergreen")).toBe(true)
    expect(isAppTheme("system")).toBe(false)
  })
})
