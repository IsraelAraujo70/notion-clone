import type { ReviewLineAddress } from "@/lib/code-review/contracts"
import { cn } from "@/lib/utils"

interface DiffLineNumberProps {
  address: ReviewLineAddress | null
  selected: boolean
  selectable?: boolean
  onSelect: (address: ReviewLineAddress, extend: boolean) => void
}

export function DiffLineNumber({
  address,
  selected,
  selectable = true,
  onSelect,
}: DiffLineNumberProps) {
  if (!address) {
    return <span aria-hidden="true" className="block min-h-6 w-12 shrink-0" />
  }

  if (!selectable) {
    return (
      <span
        aria-label={`${address.side.toLowerCase()} line ${address.line}`}
        className="block min-h-6 w-12 shrink-0 border-r px-2 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
      >
        {address.line}
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Select ${address.side.toLowerCase()} line ${address.line}`}
      aria-pressed={selected}
      className={cn(
        "min-h-6 w-12 shrink-0 border-r px-2 text-right font-mono text-xs text-muted-foreground outline-none select-none hover:bg-primary/10 hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-primary/15 text-primary"
      )}
      onClick={(event) => onSelect(address, event.shiftKey)}
    >
      {address.line}
    </button>
  )
}
