import catppuccinTheme from "./theme/themes/catppuccin.json"
import defaultTheme from "./theme/themes/default.json"
import evergreenTheme from "./theme/themes/evergreen.json"
import gruvboxTheme from "./theme/themes/gruvbox.json"
import githubTheme from "./theme/themes/github.json"
import nordTheme from "./theme/themes/nord.json"
import rosePineTheme from "./theme/themes/rose-pine.json"
import solarizedTheme from "./theme/themes/solarized.json"
import tokyoNightTheme from "./theme/themes/tokyo-night.json"

export const APP_THEME_STORAGE_KEY = "notion_clone_app_theme"
export const PUBLIC_THEME_STORAGE_KEY = "notion_clone_public_theme"
export const APP_THEMES = [
  "default",
  "github",
  "evergreen",
  "catppuccin",
  "nord",
  "gruvbox",
  "rose-pine",
  "solarized",
  "tokyo-night",
] as const
export const THEME_MODES = ["light", "dark"] as const

export type AppThemeName = (typeof APP_THEMES)[number]
export type ThemeMode = (typeof THEME_MODES)[number]
export type AppTheme = {
  theme: AppThemeName
  mode: ThemeMode
}

export type ThemeTokens = Record<string, string>
export type ThemeDefinition = {
  id: AppThemeName
  name: string
  light: { tokens: ThemeTokens }
  dark: { tokens: ThemeTokens }
}

export const DEFAULT_APP_THEME = {
  theme: "default",
  mode: "light",
} as const satisfies AppTheme

export const APP_THEME_DEFINITIONS: Record<AppThemeName, ThemeDefinition> = {
  default: { ...defaultTheme, id: "default" },
  github: { ...githubTheme, id: "github" },
  evergreen: { ...evergreenTheme, id: "evergreen" },
  catppuccin: { ...catppuccinTheme, id: "catppuccin" },
  nord: { ...nordTheme, id: "nord" },
  gruvbox: { ...gruvboxTheme, id: "gruvbox" },
  "rose-pine": { ...rosePineTheme, id: "rose-pine" },
  solarized: { ...solarizedTheme, id: "solarized" },
  "tokyo-night": { ...tokyoNightTheme, id: "tokyo-night" },
}

export function isAppThemeRoute(pathname: string | null | undefined) {
  return (
    pathname === "/dashboard" || Boolean(pathname?.startsWith("/dashboard"))
  )
}

export function getThemeStorageKey(pathname: string | null | undefined) {
  return isAppThemeRoute(pathname)
    ? APP_THEME_STORAGE_KEY
    : PUBLIC_THEME_STORAGE_KEY
}

export function getNextMode(mode: string | undefined): ThemeMode {
  return mode === "dark" ? "light" : "dark"
}

export function isAppTheme(
  value: string | null | undefined
): value is AppThemeName {
  return APP_THEMES.includes(value as AppThemeName)
}

export function isThemeMode(
  value: string | null | undefined
): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode)
}

export function normalizeStoredTheme(
  stored: string | null | undefined,
  appThemeRoute: boolean
): AppTheme {
  if (!stored) {
    return DEFAULT_APP_THEME
  }

  if (stored === "light") {
    return DEFAULT_APP_THEME
  }

  if (stored === "dark") {
    return {
      theme: appThemeRoute ? "github" : "default",
      mode: "dark",
    }
  }

  if (stored === "evergreen") {
    return {
      theme: appThemeRoute ? "evergreen" : "default",
      mode: "light",
    }
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppTheme>
    const theme =
      appThemeRoute && isAppTheme(parsed.theme) ? parsed.theme : "default"
    const mode = isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_APP_THEME.mode

    return { theme, mode }
  } catch {
    return DEFAULT_APP_THEME
  }
}
