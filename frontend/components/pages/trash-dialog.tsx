"use client"

import { useEffect, useState } from "react"
import { BlocksIcon, FileTextIcon, Trash2Icon, Undo2Icon } from "lucide-react"

import { usePages } from "@/components/pages/page-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { TrashEntry } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

const BLOCK_TYPE_MESSAGES: Record<TrashEntry["type"], Message> = {
  page: "Page",
  paragraph: "Paragraph",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bulleted_list_item: "Bulleted list item",
  numbered_list_item: "Numbered list item",
  to_do: "To-do",
  toggle: "Toggle",
  quote: "Quote",
  code: "Code",
  mermaid: "Mermaid",
  callout: "Callout",
  divider: "Divider",
  image: "Image",
  database: "Database",
  database_row: "Database row",
}

function TrashEntryRow({
  entry,
  canWrite,
  restoring,
  onRestore,
  onDelete,
}: {
  entry: TrashEntry
  canWrite: boolean
  restoring: boolean
  onRestore: () => Promise<void>
  onDelete: () => void
}) {
  const { formatDate, t } = useI18n()
  const isPage = entry.type === "page"
  const typeLabel = t(BLOCK_TYPE_MESSAGES[entry.type])
  const title = entry.title || (isPage ? t("Untitled") : typeLabel)

  return (
    <li
      data-cy={`trash-entry-${entry.id}`}
      data-trash-kind={isPage ? "page" : "block"}
      className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
        isPage ? "border-primary/20 bg-muted/40" : "bg-background"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
            isPage
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          {isPage ? (
            <FileTextIcon className="size-4" />
          ) : (
            <BlocksIcon className="size-4" />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{title}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline">{typeLabel}</Badge>
            {!isPage && entry.page_id ? (
              <span className="max-w-full min-w-0 truncate">
                {t("In {page}", {
                  page: entry.page_title || t("Untitled"),
                })}
              </span>
            ) : null}
            <time dateTime={entry.trashed_at}>
              {formatDate(entry.trashed_at, {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </time>
          </div>
        </div>
      </div>
      {canWrite ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <Button
            size="sm"
            variant="outline"
            disabled={restoring}
            data-cy={`trash-restore-${entry.id}`}
            onClick={() => void onRestore()}
          >
            <Undo2Icon data-icon="inline-start" />
            {t("Restore")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            data-cy={`trash-delete-permanently-${entry.id}`}
            onClick={onDelete}
          >
            <Trash2Icon data-icon="inline-start" />
            {t("Delete")}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { trash, refreshTrash, restore, permanentDelete, canWrite } = usePages()
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TrashEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const trashedPages = trash.filter((entry) => entry.type === "page")
  const trashedBlocks = trash.filter((entry) => entry.type !== "page")

  async function restoreEntry(blockId: string) {
    setRestoring(blockId)
    try {
      await restore(blockId)
    } finally {
      setRestoring(null)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      void refreshTrash().finally(() => !cancelled && setLoading(false))
    })
    return () => {
      cancelled = true
    }
  }, [open, refreshTrash])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-h-[min(44rem,calc(100dvh-2rem))] sm:max-w-2xl"
          data-cy="trash-dialog"
        >
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>{t("Trash")}</DialogTitle>
            <DialogDescription>
              {t(
                "Restoring returns the block and its entire subtree to its original position."
              )}
            </DialogDescription>
          </DialogHeader>

          <div
            className="min-h-0 overflow-y-auto overscroll-contain p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            role="region"
            aria-label={t("Trash contents")}
            tabIndex={0}
            data-cy="trash-scroll-area"
          >
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : trash.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t("Empty trash")}</EmptyTitle>
                  <EmptyDescription>
                    {t("Nothing has been deleted in this workspace.")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-6">
                {trashedPages.length > 0 ? (
                  <section aria-labelledby="trashed-pages-heading">
                    <h3
                      id="trashed-pages-heading"
                      className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {t("Pages")}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {trashedPages.map((entry) => (
                        <TrashEntryRow
                          key={entry.id}
                          entry={entry}
                          canWrite={canWrite}
                          restoring={restoring === entry.id}
                          onRestore={() => restoreEntry(entry.id)}
                          onDelete={() => {
                            setDeleteError(false)
                            setPendingDelete(entry)
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}
                {trashedBlocks.length > 0 ? (
                  <section aria-labelledby="trashed-blocks-heading">
                    <h3
                      id="trashed-blocks-heading"
                      className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {t("Blocks")}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {trashedBlocks.map((entry) => (
                        <TrashEntryRow
                          key={entry.id}
                          entry={entry}
                          canWrite={canWrite}
                          restoring={restoring === entry.id}
                          onRestore={() => restoreEntry(entry.id)}
                          onDelete={() => {
                            setDeleteError(false)
                            setPendingDelete(entry)
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setPendingDelete(null)
        }}
      >
        <DialogContent data-cy="trash-delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("Delete permanently?")}</DialogTitle>
            <DialogDescription>
              {t(
                '"{title}" and its entire subtree will be removed. Associated images will also be deleted. This action cannot be undone.',
                { title: pendingDelete?.title || t("Untitled") }
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <Alert variant="destructive" data-cy="trash-delete-error">
              <AlertDescription>
                {t("Could not delete. Try again.")}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              data-cy="trash-delete-cancel"
              onClick={() => setPendingDelete(null)}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || !pendingDelete}
              data-cy="trash-delete-confirm"
              onClick={async () => {
                if (!pendingDelete) return
                setDeleting(true)
                setDeleteError(false)
                try {
                  await permanentDelete(pendingDelete.id)
                  setPendingDelete(null)
                } catch {
                  setDeleteError(true)
                } finally {
                  setDeleting(false)
                }
              }}
            >
              {deleting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              {t("Delete permanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
