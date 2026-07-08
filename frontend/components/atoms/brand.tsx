import Link from "next/link"

import { cn } from "@/lib/utils"

function ReasonMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      className="size-full"
      fill="none"
    >
      <path
        d="M8.75 5.75h12.1c.7 0 1.37.28 1.86.77l6.77 6.77c.49.49.77 1.16.77 1.86v11.1c0 2.2-1.8 4-4 4H8.75c-2.2 0-4-1.8-4-4V9.75c0-2.2 1.8-4 4-4Z"
        fill="#fbfaf8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M21.75 6.2v6.05c0 1.1.9 2 2 2h6.05"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.25 25.5V14.75m0 0c1.15-1.42 2.48-2.12 4-2.12 2.63 0 4.38 1.7 4.38 4.05 0 2.45-1.83 4.07-4.52 4.07h-3.86m8.13 4.75-3.82-4.75"
        stroke="currentColor"
        strokeWidth="2.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.25" cy="25.25" r="2.15" fill="#2383e2" />
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
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-[#fbfaf8] text-[#171717] group-data-[collapsible=icon]:size-8">
        <ReasonMark />
      </span>
      <span className="group-data-[collapsible=icon]:hidden">reason</span>
    </Link>
  )
}
