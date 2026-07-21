import { DiffLineNumber } from "@/components/code-review/atoms/diff-line-number"
import { InlineThread } from "@/components/code-review/molecules/inline-thread"
import type { DiffViewMode } from "@/components/code-review/molecules/review-toolbar"
import type {
  ReviewLineAddress,
  ReviewThread,
} from "@/lib/code-review/contracts"
import {
  toSplitRows,
  toUnifiedRows,
  type DiffCodeCell,
  type SplitDiffRow,
  type UnifiedDiffRow,
} from "@/lib/code-review/diff-rows"
import {
  selectionContains,
  type LineSelection,
} from "@/lib/code-review/line-selection"
import type {
  ParsedPatch,
  PatchLineKind,
} from "@/lib/code-review/parse-unified-patch"
import { cn } from "@/lib/utils"
import { memo, useMemo, useSyncExternalStore } from "react"

const DESKTOP_QUERY = "(min-width: 768px)"

interface DiffViewerProps {
  path: string
  patch: ParsedPatch
  viewMode: DiffViewMode
  selection: LineSelection | null
  threads: ReviewThread[]
  selectable?: boolean
  onSelectLine: (address: ReviewLineAddress, extend: boolean) => void
}

export const DiffViewer = memo(function DiffViewer({
  path,
  patch,
  viewMode,
  selection,
  threads,
  selectable = true,
  onSelectLine,
}: DiffViewerProps) {
  const desktop = useSyncExternalStore(
    subscribeToDesktopLayout,
    getDesktopLayout,
    getServerLayout
  )
  const split = viewMode === "split" && desktop
  const rows = useMemo(
    () => (split ? toSplitRows(path, patch) : toUnifiedRows(path, patch)),
    [patch, path, split]
  )

  if (!split) {
    return (
      <UnifiedDiff
        rows={rows as UnifiedDiffRow[]}
        selection={selection}
        threads={threads}
        selectable={selectable}
        onSelectLine={onSelectLine}
      />
    )
  }

  return (
    <SplitDiff
      rows={rows as SplitDiffRow[]}
      selection={selection}
      threads={threads}
      selectable={selectable}
      onSelectLine={onSelectLine}
    />
  )
})

interface DiffLayoutProps {
  selection: LineSelection | null
  threads: ReviewThread[]
  selectable: boolean
  onSelectLine: (address: ReviewLineAddress, extend: boolean) => void
}

function UnifiedDiff({
  rows,
  selection,
  threads,
  selectable,
  onSelectLine,
}: DiffLayoutProps & { rows: UnifiedDiffRow[] }) {
  return (
    <div
      role="list"
      aria-label="Unified code diff"
      className="min-w-[36rem] text-sm"
    >
      {rows.map((row) => {
        if (row.type === "hunk")
          return <HunkRow key={row.id} header={row.header} />
        if (row.type === "notice")
          return <NoticeRow key={row.id} state={row.state} />

        const rowThreads = threads.filter(
          (thread) =>
            matchesThread(thread, row.leftAddress) ||
            matchesThread(thread, row.rightAddress)
        )
        return (
          <div key={row.id} role="listitem">
            <div className={cn("flex min-h-6", lineColor(row.kind))}>
              <DiffLineNumber
                address={row.leftAddress}
                selected={
                  !!row.leftAddress &&
                  selectionContains(selection, row.leftAddress)
                }
                selectable={selectable}
                onSelect={onSelectLine}
              />
              <DiffLineNumber
                address={row.rightAddress}
                selected={
                  !!row.rightAddress &&
                  selectionContains(selection, row.rightAddress)
                }
                selectable={selectable}
                onSelect={onSelectLine}
              />
              <CodeText
                kind={row.kind}
                content={row.content}
                noNewline={row.noNewline}
              />
            </div>
            {rowThreads.map((thread) => (
              <InlineThread key={thread.id} thread={thread} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function SplitDiff({
  rows,
  selection,
  threads,
  selectable,
  onSelectLine,
}: DiffLayoutProps & { rows: SplitDiffRow[] }) {
  return (
    <div className="min-w-[64rem] text-sm">
      <div
        aria-hidden="true"
        className="grid grid-cols-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground"
      >
        <div className="border-r px-3 py-1.5">Base</div>
        <div className="px-3 py-1.5">Head</div>
      </div>
      <div role="list" aria-label="Split code diff">
        {rows.map((row) => {
          if (row.type === "hunk")
            return <HunkRow key={row.id} header={row.header} />
          if (row.type === "notice")
            return <NoticeRow key={row.id} state={row.state} />

          const leftThreads = threads.filter((thread) =>
            matchesThread(thread, row.left?.address ?? null)
          )
          const rightThreads = threads.filter((thread) =>
            matchesThread(thread, row.right?.address ?? null)
          )
          return (
            <div key={row.id} role="listitem">
              <div className="grid grid-cols-2">
                <SplitCell
                  cell={row.left}
                  selection={selection}
                  selectable={selectable}
                  border
                  onSelectLine={onSelectLine}
                />
                <SplitCell
                  cell={row.right}
                  selection={selection}
                  selectable={selectable}
                  onSelectLine={onSelectLine}
                />
              </div>
              {(leftThreads.length > 0 || rightThreads.length > 0) && (
                <div className="grid grid-cols-2 border-y bg-muted/10">
                  <div className="min-w-0 border-r">
                    {leftThreads.map((thread) => (
                      <InlineThread key={thread.id} thread={thread} />
                    ))}
                  </div>
                  <div className="min-w-0">
                    {rightThreads.map((thread) => (
                      <InlineThread key={thread.id} thread={thread} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SplitCell({
  cell,
  selection,
  selectable,
  border = false,
  onSelectLine,
}: {
  cell: DiffCodeCell | null
  selection: LineSelection | null
  selectable: boolean
  border?: boolean
  onSelectLine: (address: ReviewLineAddress, extend: boolean) => void
}) {
  return (
    <div
      className={cn(
        "flex min-h-6 min-w-0",
        border && "border-r",
        cell ? lineColor(cell.kind) : "bg-muted/20"
      )}
    >
      <DiffLineNumber
        address={cell?.address ?? null}
        selected={!!cell && selectionContains(selection, cell.address)}
        selectable={selectable}
        onSelect={onSelectLine}
      />
      {cell ? (
        <CodeText
          kind={cell.kind}
          content={cell.content}
          noNewline={cell.noNewline}
        />
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  )
}

function HunkRow({ header }: { header: string }) {
  return (
    <div
      role="listitem"
      className="border-y border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
    >
      {header}
    </div>
  )
}

function NoticeRow({
  state,
}: {
  state: "binary" | "missing" | "malformed" | "truncated"
}) {
  return (
    <div
      role="listitem"
      className="p-8 text-center text-sm text-muted-foreground"
    >
      {noticeMessage(state)}
    </div>
  )
}

function CodeText({
  kind,
  content,
  noNewline,
}: {
  kind: PatchLineKind
  content: string
  noNewline: boolean
}) {
  return (
    <pre className="min-w-0 flex-1 overflow-visible px-2 font-mono text-xs leading-6 whitespace-pre">
      <span
        aria-hidden="true"
        className="mr-2 inline-block w-2 text-muted-foreground select-none"
      >
        {kind === "addition" ? "+" : kind === "deletion" ? "-" : " "}
      </span>
      {content}
      {noNewline && (
        <span className="ml-3 text-muted-foreground">
          No newline at end of file
        </span>
      )}
    </pre>
  )
}

function lineColor(kind: PatchLineKind): string {
  if (kind === "addition") return "bg-emerald-50 dark:bg-emerald-950/30"
  if (kind === "deletion") return "bg-red-50 dark:bg-red-950/30"
  return "bg-background"
}

function matchesThread(
  thread: ReviewThread,
  address: ReviewLineAddress | null
): boolean {
  return (
    !!address &&
    thread.path === address.path &&
    thread.side === address.side &&
    thread.line === address.line
  )
}

function noticeMessage(
  state: "binary" | "missing" | "malformed" | "truncated"
): string {
  if (state === "binary") return "Binary file cannot be displayed."
  if (state === "missing") return "Patch is unavailable for this file."
  if (state === "truncated")
    return "Patch is truncated and cannot be displayed safely."
  return "Patch is malformed and cannot be displayed safely."
}

function subscribeToDesktopLayout(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getDesktopLayout(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_QUERY).matches
    : false
}

function getServerLayout(): boolean {
  return false
}
