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

  // O provider lê o tema do localStorage na inicialização do state, então o
  // primeiro render do cliente já pode divergir do HTML do servidor. Até montar,
  // renderizamos o mesmo que o servidor ("light") — senão o aria-label e o ícone
  // quebram a hidratação.
  const theme = mounted ? resolvedTheme : "light"
  const nextTheme = getNextTheme(theme)
  const label =
    nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode"
  const Icon = theme === "dark" ? Sun : Moon

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
