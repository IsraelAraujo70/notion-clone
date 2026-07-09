"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  type AppTheme,
  type AppThemeName,
  APP_THEME_DEFINITIONS,
  DEFAULT_APP_THEME,
  type ThemeMode,
  getNextMode,
  getThemeStorageKey,
  isAppThemeRoute,
  normalizeStoredTheme,
} from "@/lib/theme"

type ThemeContextValue = {
  theme: AppThemeName
  mode: ThemeMode
  setTheme: (theme: AppThemeName) => void
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function readStoredTheme(storageKey: string, appThemeRoute: boolean): AppTheme {
  if (typeof window === "undefined") {
    return DEFAULT_APP_THEME
  }

  const stored = window.localStorage.getItem(storageKey)
  return normalizeStoredTheme(stored, appThemeRoute)
}

function applyResolvedTheme({ mode, theme }: AppTheme) {
  const tokens = APP_THEME_DEFINITIONS[theme][mode].tokens
  const root = document.documentElement

  root.dataset.theme = theme
  root.dataset.themeMode = mode
  root.classList.toggle("dark", mode === "dark")
  root.style.colorScheme = mode

  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(`--${name}`, value)
  }
}

function ThemeProvider({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const storageKey = getThemeStorageKey(pathname)
  const appThemeRoute = isAppThemeRoute(pathname)

  return (
    <ThemeProviderState
      key={storageKey}
      storageKey={storageKey}
      appThemeRoute={appThemeRoute}
    >
      {children}
    </ThemeProviderState>
  )
}

function ThemeProviderState({
  appThemeRoute,
  children,
  storageKey,
}: Readonly<{
  appThemeRoute: boolean
  children: React.ReactNode
  storageKey: string
}>) {
  const [theme, setThemeState] = React.useState<AppTheme>(() =>
    readStoredTheme(storageKey, appThemeRoute)
  )

  React.useEffect(() => {
    applyResolvedTheme(theme)
    window.localStorage.setItem(storageKey, JSON.stringify(theme))
  }, [storageKey, theme])

  const setTheme = React.useCallback(
    (nextTheme: AppThemeName) => {
      setThemeState((currentTheme) => {
        const themeConfig = {
          theme: appThemeRoute ? nextTheme : "default",
          mode: currentTheme.mode,
        } as const satisfies AppTheme

        return themeConfig
      })
    },
    [appThemeRoute]
  )

  const setMode = React.useCallback(
    (nextMode: ThemeMode) => {
      setThemeState((currentTheme) => {
        const themeConfig = {
          theme: appThemeRoute ? currentTheme.theme : "default",
          mode: nextMode,
        } as const satisfies AppTheme

        return themeConfig
      })
    },
    [appThemeRoute]
  )

  return (
    <ThemeContext.Provider
      value={{
        theme: theme.theme,
        mode: theme.mode,
        setTheme,
        setMode,
      }}
    >
      {appThemeRoute && <ThemeHotkey />}
      {children}
    </ThemeContext.Provider>
  )
}

function useAppTheme() {
  const context = React.useContext(ThemeContext)

  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider")
  }

  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { mode, setMode } = useAppTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setMode(getNextMode(mode))
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [mode, setMode])

  return null
}

export { ThemeProvider, useAppTheme }
