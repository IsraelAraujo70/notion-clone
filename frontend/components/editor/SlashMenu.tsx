"use client"

import type { BlockType } from "@/lib/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

export interface SlashItem {
  type: BlockType
  icon: string
  label: string
  keywords: string
}

export const SLASH_ITEMS = [
  {
    type: "paragraph",
    icon: "T",
    label: "Text",
    keywords: "paragraph text",
  },
  {
    type: "heading1",
    icon: "H1",
    label: "Heading 1",
    keywords: "heading title h1",
  },
  {
    type: "heading2",
    icon: "H2",
    label: "Heading 2",
    keywords: "heading title h2",
  },
  {
    type: "heading3",
    icon: "H3",
    label: "Heading 3",
    keywords: "heading title h3",
  },
  {
    type: "bulleted_list_item",
    icon: "•",
    label: "Bulleted list",
    keywords: "bullet list",
  },
  {
    type: "numbered_list_item",
    icon: "1.",
    label: "Numbered list",
    keywords: "number numbered list",
  },
  {
    type: "to_do",
    icon: "☐",
    label: "To-do",
    keywords: "todo checkbox task",
  },
  { type: "toggle", icon: "▸", label: "Toggle", keywords: "toggle collapse" },
  { type: "quote", icon: "”", label: "Quote", keywords: "quote citation" },
  { type: "code", icon: "</>", label: "Code", keywords: "code source" },
  { type: "callout", icon: "💡", label: "Callout", keywords: "callout notice" },
  {
    type: "divider",
    icon: "—",
    label: "Divider",
    keywords: "divider line",
  },
  {
    type: "image",
    icon: "🖼",
    label: "Image",
    keywords: "image photo picture upload",
  },
] as const satisfies readonly (Omit<SlashItem, "label" | "keywords"> & {
  label: Message
  keywords: Message
})[]

interface SlashMenuProps {
  items: SlashItem[]
  query: string
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (type: BlockType) => void
}

export function filteredSlashItems(
  query: string,
  items: readonly SlashItem[] = SLASH_ITEMS
): SlashItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized || normalized === "block" || normalized === "bloco") {
    return [...items]
  }
  return items.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(normalized)
  )
}

export function useSlashItems(): SlashItem[] {
  const { t } = useI18n()
  return SLASH_ITEMS.map((item) => ({
    ...item,
    label: t(item.label),
    keywords: t(item.keywords),
  }))
}

export function SlashMenu({
  items,
  query,
  activeIndex,
  onHover,
  onSelect,
}: SlashMenuProps) {
  const filteredItems = filteredSlashItems(query, items)
  if (filteredItems.length === 0) return null

  return (
    // `max-h` + scroll: a lista tem 13 tipos e não cabe na viewport perto do
    // rodapé da página. O item ativo é trazido à vista pelo `scrollIntoView`.
    <div className="absolute top-full left-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-lg">
      {filteredItems.map((item, index) => (
        <button
          key={item.type}
          type="button"
          ref={(node) => {
            if (node && index === activeIndex)
              node.scrollIntoView({ block: "nearest" })
          }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
            index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          }`}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(item.type)
          }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-muted text-xs font-semibold text-muted-foreground">
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
