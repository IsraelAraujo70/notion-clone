import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ThemeToggleButton } from "./theme-toggle-button"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { APP_THEME_STORAGE_KEY } from "@/lib/theme"

function ssr() {
  return renderToString(
    <ThemeProvider>
      <TooltipProvider>
        <ThemeToggleButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}

describe("ThemeToggleButton", () => {
  // Regressão de hidratação: o provider lê o tema do localStorage já no
  // inicializador do state, então o primeiro render do cliente conhece o tema
  // real. O botão precisa renderizar o mesmo que o servidor até montar.
  it("renders the light-theme label before mount, whatever is stored", () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "dark")

    expect(ssr()).toContain("Switch to dark mode")
    expect(ssr()).not.toContain("Switch to light mode")

    window.localStorage.clear()
  })
})
