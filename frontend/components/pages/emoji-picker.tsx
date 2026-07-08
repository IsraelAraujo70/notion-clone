"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// ponytail: grade curada, não o Unicode inteiro. Cobre o uso real (ícone de
// página) sem uma dependência de picker. Se pedirem busca/skin tones, troque o
// corpo do Popover por `emoji-mart` — a API deste componente não muda.
export const PAGE_EMOJIS = [
  "📄", "📝", "📔", "📚", "🗂️", "📌", "📎", "🔖",
  "🚀", "🎯", "💡", "🔥", "⭐", "✅", "⚡", "🧠",
  "🛠️", "🐛", "🔍", "📊", "📈", "💰", "🗓️", "⏱️",
  "🏠", "🏢", "🌍", "✈️", "☕", "🍕", "🎵", "🎨",
  "🤖", "👋", "🙌", "🎉", "❤️", "😀", "🤔", "😴",
] as const

export const DEFAULT_PAGE_EMOJI = "📄"

export function EmojiPicker({
  value,
  onSelect,
  disabled,
  className,
  label = "Escolher ícone da página",
}: {
  value: string
  onSelect: (emoji: string | null) => void
  disabled?: boolean
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)

  const choose = (emoji: string | null) => {
    onSelect(emoji)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          data-cy="page-icon-trigger"
          className={`grid size-12 place-items-center rounded-md text-[36px] leading-none transition-colors hover:bg-muted disabled:pointer-events-none ${className ?? ""}`}
        >
          {value || DEFAULT_PAGE_EMOJI}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" data-cy="page-icon-menu">
        <div className="grid grid-cols-8 gap-1">
          {PAGE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
              data-cy={`page-icon-option-${emoji}`}
              className="grid size-8 place-items-center rounded text-xl hover:bg-muted"
              onClick={() => choose(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          data-cy="page-icon-remove"
          onClick={() => choose(null)}
        >
          Remover ícone
        </Button>
      </PopoverContent>
    </Popover>
  )
}
