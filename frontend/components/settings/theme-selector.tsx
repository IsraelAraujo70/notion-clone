"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppTheme } from "@/components/theme/theme-provider"
import {
  APP_THEME_DEFINITIONS,
  APP_THEMES,
  type AppThemeName,
  type ThemeMode,
} from "@/lib/theme"

const themes: Array<{
  value: AppThemeName
  label: string
  swatch: string
}> = APP_THEMES.map((value) => ({
  value,
  label: APP_THEME_DEFINITIONS[value].name,
  swatch: APP_THEME_DEFINITIONS[value].light.tokens.sidebar,
}))

const modes: Array<{
  value: ThemeMode
  label: string
  swatch: string
}> = [
  {
    value: "light",
    label: "Light",
    swatch: "bg-white",
  },
  {
    value: "dark",
    label: "Dark",
    swatch: "bg-[#191919]",
  },
]

export function ThemeSelector() {
  const { mode, setMode, setTheme, theme } = useAppTheme()

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        value={theme}
        onValueChange={(value) => {
          if (value) {
            setTheme(value as AppThemeName)
          }
        }}
        className="grid w-full grid-cols-3"
        variant="outline"
        spacing={1}
      >
        {themes.map((item) => (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            data-cy={`theme-${item.value}`}
            className="h-auto flex-col gap-2 px-2 py-3"
          >
            <span
              className="size-6 rounded-full border"
              style={{ backgroundColor: item.swatch }}
            />
            <span>{item.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) {
            setMode(value as ThemeMode)
          }
        }}
        className="grid w-full grid-cols-2"
        variant="outline"
        spacing={1}
      >
        {modes.map((item) => (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            data-cy={`theme-mode-${item.value}`}
            className="h-auto flex-col gap-2 px-2 py-3"
          >
            <span className={`size-6 rounded-full border ${item.swatch}`} />
            <span>{item.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
