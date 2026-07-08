"use client"

import type { BlockType } from "@/lib/contracts"

export interface SlashItem {
  type: BlockType
  icon: string
  label: string
  keywords: string
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    type: "paragraph",
    icon: "T",
    label: "Texto",
    keywords: "paragraph text texto",
  },
  {
    type: "heading1",
    icon: "H1",
    label: "Título 1",
    keywords: "heading titulo h1",
  },
  {
    type: "heading2",
    icon: "H2",
    label: "Título 2",
    keywords: "heading titulo h2",
  },
  {
    type: "heading3",
    icon: "H3",
    label: "Título 3",
    keywords: "heading titulo h3",
  },
  {
    type: "bulleted_list_item",
    icon: "•",
    label: "Lista com marcadores",
    keywords: "bullet lista",
  },
  {
    type: "numbered_list_item",
    icon: "1.",
    label: "Lista numerada",
    keywords: "number numbered lista",
  },
  {
    type: "to_do",
    icon: "☐",
    label: "Tarefa",
    keywords: "todo checkbox tarefa",
  },
  { type: "toggle", icon: "▸", label: "Toggle", keywords: "toggle recolher" },
  { type: "quote", icon: "”", label: "Citação", keywords: "quote citacao" },
  { type: "code", icon: "</>", label: "Código", keywords: "code codigo" },
  { type: "callout", icon: "💡", label: "Callout", keywords: "callout aviso" },
  {
    type: "divider",
    icon: "—",
    label: "Divisor",
    keywords: "divider divisor linha",
  },
]

interface SlashMenuProps {
  query: string
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (type: BlockType) => void
}

export function filteredSlashItems(query: string): SlashItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(normalized)
  )
}

export function SlashMenu({
  query,
  activeIndex,
  onHover,
  onSelect,
}: SlashMenuProps) {
  const items = filteredSlashItems(query)
  if (items.length === 0) return null

  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-zinc-900 shadow-lg">
      {items.map((item, index) => (
        <button
          key={item.type}
          type="button"
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
            index === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50"
          }`}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(item.type)
          }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
