"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  type AppTheme,
  getNextTheme,
  getThemeStorageKey,
  isAppTheme,
  isAppThemeRoute,
} from "@/lib/theme"

type ThemeContextValue = {
  theme: AppTheme
  resolvedTheme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function readStoredTheme(storageKey: string): AppTheme {
  if (typeof window === "undefined") {
    return "light"
  }

  const stored = window.localStorage.getItem(storageKey)
  return isAppTheme(stored) ? stored : "light"
}

function applyResolvedTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle("dark", theme === "dark")
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
    readStoredTheme(storageKey)
  )
  const resolvedTheme = theme

  React.useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = React.useCallback(
    (nextTheme: AppTheme) => {
      setThemeState(nextTheme)
      window.localStorage.setItem(storageKey, nextTheme)
    },
    [storageKey]
  )

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
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
  const { resolvedTheme, setTheme } = useAppTheme()

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

      setTheme(getNextTheme(resolvedTheme))
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useAppTheme }
