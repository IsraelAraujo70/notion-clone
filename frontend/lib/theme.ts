export const APP_THEME_STORAGE_KEY = "notion_clone_app_theme"
export const PUBLIC_THEME_STORAGE_KEY = "notion_clone_public_theme"
export const APP_THEMES = ["light", "dark", "evergreen"] as const

export type AppTheme = (typeof APP_THEMES)[number]

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

export function getNextTheme(resolvedTheme: string | undefined) {
  if (resolvedTheme === "light") {
    return "dark"
  }
  if (resolvedTheme === "dark") {
    return "evergreen"
  }
  return "light"
}

export function isAppTheme(
  value: string | null | undefined
): value is AppTheme {
  return APP_THEMES.includes(value as AppTheme)
}
