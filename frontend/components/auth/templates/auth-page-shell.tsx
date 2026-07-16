"use client"

import type { ReactNode } from "react"

import { Brand } from "@/components/atoms/brand"
import { LanguageSelector } from "@/components/atoms/language-selector"

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="absolute top-5 right-5">
        <LanguageSelector compact />
      </div>
      <Brand />
      {children}
    </div>
  )
}
