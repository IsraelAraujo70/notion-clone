import Link from "next/link"

import { cn } from "@/lib/utils"

// Mesma marca do sidebar (`public/reason-logo-sidebar-*.svg`), inline para herdar
// a cor do tema e não pagar uma requisição no topo da landing.
function ReasonMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 256 256"
      className="size-full"
      fill="none"
    >
      <rect
        x="16"
        y="16"
        width="224"
        height="224"
        rx="47"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="14"
      />
      <g fill="#111111">
        <rect x="58" y="58" width="40" height="40" rx="2" />
        <rect x="58" y="108" width="40" height="40" rx="2" />
        <rect x="58" y="158" width="40" height="40" rx="2" />
        <path d="M114 58h39c35 0 61 26 61 59s-26 59-61 59h-39z" />
        <path d="M114 158h47l56 58h-52z" />
      </g>
    </svg>
  )
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-3 rounded-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg group-data-[collapsible=icon]:size-8">
        <ReasonMark />
      </span>
      <span className="group-data-[collapsible=icon]:hidden">reason</span>
    </Link>
  )
}
