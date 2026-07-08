"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { useAppTheme } from "@/components/theme/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getNextTheme } from "@/lib/theme"

function subscribeMounted() {
  return () => undefined
}

function getMountedSnapshot() {
  return true
}

function getServerMountedSnapshot() {
  return false
}

export function ThemeToggleButton() {
  const mounted = React.useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerMountedSnapshot
  )
  const { resolvedTheme, setTheme } = useAppTheme()

  const nextTheme = getNextTheme(resolvedTheme)
  const label =
    nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode"
  const Icon = resolvedTheme === "dark" ? Sun : Moon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={!mounted}
          onClick={() => setTheme(nextTheme)}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
