import * as SecureStore from "expo-secure-store"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

const STORAGE_KEY = "reason_app_theme"

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

export type AppThemeName = (typeof APP_THEMES)[number]
export type ThemeMode = "light" | "dark"

export type ThemeTokens = {
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  border: string
  input: string
  ring: string
  sidebar: string
  sidebarAccent: string
  manila: string
  success: string
  destructive: string
}

type PaletteInput = Omit<ThemeTokens, "cardForeground">

function palette(input: PaletteInput): ThemeTokens {
  return { ...input, cardForeground: input.foreground }
}

export const THEME_DEFINITIONS: Record<
  AppThemeName,
  { name: string; light: ThemeTokens; dark: ThemeTokens }
> = {
  default: {
    name: "Default",
    light: palette({
      background: "#fbfaf8",
      foreground: "#37352f",
      card: "#ffffff",
      primary: "#37352f",
      primaryForeground: "#ffffff",
      muted: "#f1efeb",
      mutedForeground: "#787774",
      accent: "#e8f1ff",
      border: "#e9e9e7",
      input: "#d9d9d6",
      ring: "#2383e2",
      sidebar: "#f7f7f5",
      sidebarAccent: "#eeeeec",
      manila: "#f1c232",
      success: "#2e7d32",
      destructive: "#c83e3e",
    }),
    dark: palette({
      background: "#191919",
      foreground: "#e6e6e6",
      card: "#202020",
      primary: "#eeeeee",
      primaryForeground: "#191919",
      muted: "#2f2f2f",
      mutedForeground: "#a3a3a3",
      accent: "#303840",
      border: "#373737",
      input: "#464646",
      ring: "#2383e2",
      sidebar: "#202020",
      sidebarAccent: "#2f2f2f",
      manila: "#d29922",
      success: "#3fb950",
      destructive: "#f07178",
    }),
  },
  github: {
    name: "GitHub",
    light: palette({
      background: "#ffffff",
      foreground: "#24292f",
      card: "#ffffff",
      primary: "#0969da",
      primaryForeground: "#ffffff",
      muted: "#f6f8fa",
      mutedForeground: "#57606a",
      accent: "#ddf4ff",
      border: "#d0d7de",
      input: "#d0d7de",
      ring: "#0969da",
      sidebar: "#f6f8fa",
      sidebarAccent: "#eaeef2",
      manila: "#d4a72c",
      success: "#1a7f37",
      destructive: "#cf222e",
    }),
    dark: palette({
      background: "#0d1117",
      foreground: "#c9d1d9",
      card: "#161b22",
      primary: "#58a6ff",
      primaryForeground: "#0d1117",
      muted: "#21262d",
      mutedForeground: "#8b949e",
      accent: "#1f6feb",
      border: "#30363d",
      input: "#30363d",
      ring: "#58a6ff",
      sidebar: "#010409",
      sidebarAccent: "#21262d",
      manila: "#d29922",
      success: "#2e7d32",
      destructive: "#f85149",
    }),
  },
  evergreen: {
    name: "Evergreen",
    light: palette({
      background: "#f5fbf8",
      foreground: "#102522",
      card: "#ffffff",
      primary: "#0f766e",
      primaryForeground: "#ffffff",
      muted: "#e8f4ef",
      mutedForeground: "#55716a",
      accent: "#d9f3ee",
      border: "#c7ddd5",
      input: "#b7d4cb",
      ring: "#0e7490",
      sidebar: "#dceee8",
      sidebarAccent: "#cce4dc",
      manila: "#f1c232",
      success: "#2e7d32",
      destructive: "#c83e3e",
    }),
    dark: palette({
      background: "#0d1f1c",
      foreground: "#d7ede7",
      card: "#122923",
      primary: "#5eead4",
      primaryForeground: "#08201c",
      muted: "#18362f",
      mutedForeground: "#91b9af",
      accent: "#17443d",
      border: "#26524a",
      input: "#2c5f55",
      ring: "#2dd4bf",
      sidebar: "#0a1715",
      sidebarAccent: "#18362f",
      manila: "#d29922",
      success: "#3fb950",
      destructive: "#f07178",
    }),
  },
  catppuccin: {
    name: "Catppuccin",
    light: palette({
      background: "#eff1f5",
      foreground: "#4c4f69",
      card: "#ffffff",
      primary: "#8839ef",
      primaryForeground: "#ffffff",
      muted: "#e6e9ef",
      mutedForeground: "#6c6f85",
      accent: "#e4def4",
      border: "#ccd0da",
      input: "#bcc0cc",
      ring: "#8839ef",
      sidebar: "#e6e9ef",
      sidebarAccent: "#dce0e8",
      manila: "#df8e1d",
      success: "#40a02b",
      destructive: "#d20f39",
    }),
    dark: palette({
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      card: "#181825",
      primary: "#cba6f7",
      primaryForeground: "#1e1e2e",
      muted: "#313244",
      mutedForeground: "#a6adc8",
      accent: "#45475a",
      border: "#45475a",
      input: "#585b70",
      ring: "#cba6f7",
      sidebar: "#11111b",
      sidebarAccent: "#313244",
      manila: "#f9e2af",
      success: "#a6e3a1",
      destructive: "#f38ba8",
    }),
  },
  nord: {
    name: "Nord",
    light: palette({
      background: "#eceff4",
      foreground: "#2e3440",
      card: "#ffffff",
      primary: "#5e81ac",
      primaryForeground: "#ffffff",
      muted: "#e5e9f0",
      mutedForeground: "#60728a",
      accent: "#d8dee9",
      border: "#d8dee9",
      input: "#c8d0dd",
      ring: "#5e81ac",
      sidebar: "#e5e9f0",
      sidebarAccent: "#d8dee9",
      manila: "#ebcb8b",
      success: "#a3be8c",
      destructive: "#bf616a",
    }),
    dark: palette({
      background: "#2e3440",
      foreground: "#eceff4",
      card: "#3b4252",
      primary: "#88c0d0",
      primaryForeground: "#2e3440",
      muted: "#434c5e",
      mutedForeground: "#d8dee9",
      accent: "#4c566a",
      border: "#4c566a",
      input: "#5a6579",
      ring: "#88c0d0",
      sidebar: "#242933",
      sidebarAccent: "#434c5e",
      manila: "#ebcb8b",
      success: "#a3be8c",
      destructive: "#bf616a",
    }),
  },
  gruvbox: {
    name: "Gruvbox",
    light: palette({
      background: "#fbf1c7",
      foreground: "#3c3836",
      card: "#f9f5d7",
      primary: "#af3a03",
      primaryForeground: "#fbf1c7",
      muted: "#ebdbb2",
      mutedForeground: "#7c6f64",
      accent: "#d5c4a1",
      border: "#d5c4a1",
      input: "#bdae93",
      ring: "#b57614",
      sidebar: "#f2e5bc",
      sidebarAccent: "#ebdbb2",
      manila: "#d79921",
      success: "#98971a",
      destructive: "#cc241d",
    }),
    dark: palette({
      background: "#282828",
      foreground: "#ebdbb2",
      card: "#32302f",
      primary: "#fabd2f",
      primaryForeground: "#282828",
      muted: "#3c3836",
      mutedForeground: "#a89984",
      accent: "#504945",
      border: "#504945",
      input: "#665c54",
      ring: "#fabd2f",
      sidebar: "#1d2021",
      sidebarAccent: "#3c3836",
      manila: "#d79921",
      success: "#b8bb26",
      destructive: "#fb4934",
    }),
  },
  "rose-pine": {
    name: "Rose Pine",
    light: palette({
      background: "#faf4ed",
      foreground: "#575279",
      card: "#fffaf3",
      primary: "#907aa9",
      primaryForeground: "#fffaf3",
      muted: "#f2e9e1",
      mutedForeground: "#797593",
      accent: "#dfdad9",
      border: "#dfdad9",
      input: "#cecacd",
      ring: "#907aa9",
      sidebar: "#f2e9e1",
      sidebarAccent: "#e8dfd8",
      manila: "#ea9d34",
      success: "#56949f",
      destructive: "#b4637a",
    }),
    dark: palette({
      background: "#191724",
      foreground: "#e0def4",
      card: "#1f1d2e",
      primary: "#c4a7e7",
      primaryForeground: "#191724",
      muted: "#26233a",
      mutedForeground: "#908caa",
      accent: "#403d52",
      border: "#403d52",
      input: "#524f67",
      ring: "#c4a7e7",
      sidebar: "#11101a",
      sidebarAccent: "#26233a",
      manila: "#f6c177",
      success: "#9ccfd8",
      destructive: "#eb6f92",
    }),
  },
  solarized: {
    name: "Solarized",
    light: palette({
      background: "#fdf6e3",
      foreground: "#586e75",
      card: "#fffaf0",
      primary: "#268bd2",
      primaryForeground: "#fdf6e3",
      muted: "#eee8d5",
      mutedForeground: "#657b83",
      accent: "#e4dcc3",
      border: "#d6ceb8",
      input: "#c8c0aa",
      ring: "#268bd2",
      sidebar: "#eee8d5",
      sidebarAccent: "#e4dcc3",
      manila: "#b58900",
      success: "#859900",
      destructive: "#dc322f",
    }),
    dark: palette({
      background: "#002b36",
      foreground: "#93a1a1",
      card: "#073642",
      primary: "#2aa198",
      primaryForeground: "#002b36",
      muted: "#0b3f4a",
      mutedForeground: "#839496",
      accent: "#164b56",
      border: "#164b56",
      input: "#235965",
      ring: "#2aa198",
      sidebar: "#00212b",
      sidebarAccent: "#073642",
      manila: "#b58900",
      success: "#859900",
      destructive: "#dc322f",
    }),
  },
  "tokyo-night": {
    name: "Tokyo Night",
    light: palette({
      background: "#d5d6db",
      foreground: "#343b58",
      card: "#ffffff",
      primary: "#34548a",
      primaryForeground: "#ffffff",
      muted: "#e1e2e7",
      mutedForeground: "#6b728f",
      accent: "#d9d7ee",
      border: "#c4c8da",
      input: "#b6b9cc",
      ring: "#34548a",
      sidebar: "#e1e2e7",
      sidebarAccent: "#d5d6db",
      manila: "#8f5e15",
      success: "#485e30",
      destructive: "#8c4351",
    }),
    dark: palette({
      background: "#1a1b26",
      foreground: "#c0caf5",
      card: "#1f2335",
      primary: "#7aa2f7",
      primaryForeground: "#1a1b26",
      muted: "#24283b",
      mutedForeground: "#9aa5ce",
      accent: "#414868",
      border: "#414868",
      input: "#565f89",
      ring: "#7aa2f7",
      sidebar: "#15161f",
      sidebarAccent: "#24283b",
      manila: "#e0af68",
      success: "#9ece6a",
      destructive: "#f7768e",
    }),
  },
}

export const fonts = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  heading: "BricolageGrotesque_600SemiBold",
  headingBold: "BricolageGrotesque_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const

type ThemeContextValue = {
  theme: AppThemeName
  mode: ThemeMode
  tokens: ThemeTokens
  setTheme: (theme: AppThemeName) => void
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeName>("default")
  const [mode, setModeState] = useState<ThemeMode>("light")

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (!stored) return
      try {
        const value = JSON.parse(stored) as {
          theme?: AppThemeName
          mode?: ThemeMode
        }
        if (APP_THEMES.includes(value.theme as AppThemeName)) {
          setThemeState(value.theme as AppThemeName)
        }
        if (value.mode === "light" || value.mode === "dark") {
          setModeState(value.mode)
        }
      } catch {
        SecureStore.deleteItemAsync(STORAGE_KEY)
      }
    })
  }, [])

  function persist(nextTheme: AppThemeName, nextMode: ThemeMode) {
    SecureStore.setItemAsync(
      STORAGE_KEY,
      JSON.stringify({ theme: nextTheme, mode: nextMode })
    )
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        tokens: THEME_DEFINITIONS[theme][mode],
        setTheme(nextTheme) {
          setThemeState(nextTheme)
          persist(nextTheme, mode)
        },
        setMode(nextMode) {
          setModeState(nextMode)
          persist(theme, nextMode)
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useAppTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useAppTheme must be used inside ThemeProvider")
  return context
}
