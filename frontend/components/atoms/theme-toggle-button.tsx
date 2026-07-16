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
import { getNextMode } from "@/lib/theme"
import { useI18n } from "@/lib/i18n/i18n-provider"

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
  const { mode: resolvedMode, setMode } = useAppTheme()
  const { t } = useI18n()

  // O provider lê o tema do localStorage na inicialização do state, então o
  // primeiro render do cliente já pode divergir do HTML do servidor. Até montar,
  // renderizamos o mesmo que o servidor ("light") — senão o aria-label e o ícone
  // quebram a hidratação.
  const mode = mounted ? resolvedMode : "light"
  const nextMode = getNextMode(mode)
  const label =
    nextMode === "dark"
      ? t("Switch to dark mode")
      : t("Switch to light mode")
  const Icon = mode === "dark" ? Sun : Moon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={!mounted}
          onClick={() => setMode(nextMode)}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
