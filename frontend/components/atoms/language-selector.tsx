"use client"

import { LanguagesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n, type Locale } from "@/lib/i18n/i18n-provider"

const locales: Locale[] = ["en", "pt-BR"]

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n()
  const labels: Record<Locale, string> = {
    en: t("English"),
    "pt-BR": t("Portuguese"),
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          aria-label={t("Select language")}
          data-cy="language-selector"
        >
          <LanguagesIcon />
          {!compact && <span>{labels[locale]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((value) => (
          <DropdownMenuItem
            key={value}
            data-cy={`language-${value}`}
            onSelect={() => setLocale(value)}
          >
            {labels[value]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
