"use client"

import { useEffect } from "react"

import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

export function LocalizedDocumentTitle({ title }: { title: Message }) {
  const { t } = useI18n()

  useEffect(() => {
    document.title = `${t(title)} · reason`
  }, [t, title])

  return null
}
