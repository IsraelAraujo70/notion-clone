"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppTheme } from "@/components/theme/theme-provider"
import type { AppTheme } from "@/lib/theme"

const themes: Array<{
  value: AppTheme
  label: string
  swatch: string
}> = [
  {
    value: "light",
    label: "Light",
    swatch: "bg-[#fbfaf8]",
  },
  {
    value: "dark",
    label: "Dark",
    swatch: "bg-[#0d1117]",
  },
  {
    value: "evergreen",
    label: "Evergreen",
    swatch: "bg-[#dceee8]",
  },
]

export function ThemeSelector() {
  const { theme, setTheme } = useAppTheme()

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => {
        if (value) {
          setTheme(value as AppTheme)
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
          <span className={`size-6 rounded-full border ${item.swatch}`} />
          <span>{item.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
