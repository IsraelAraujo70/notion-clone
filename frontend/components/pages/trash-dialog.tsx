"use client"

import { useEffect, useState } from "react"
import { FileTextIcon, Trash2Icon, Undo2Icon } from "lucide-react"

import { usePages } from "@/components/pages/page-provider"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
}

export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { formatDate, t } = useI18n()
  const { trash, refreshTrash, restore, permanentDelete, canWrite } = usePages()
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TrashEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

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
        <DialogContent className="sm:max-w-lg" data-cy="trash-dialog">
          <DialogHeader>
            <DialogTitle>{t("Trash")}</DialogTitle>
            <DialogDescription>
              {t(
                "Restoring returns the block and its entire subtree to its original position."
              )}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
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
            <ul className="flex flex-col gap-2">
              {trash.map((entry) => (
                <li
                  key={entry.id}
                  data-cy={`trash-entry-${entry.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {entry.title || t("Untitled")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(BLOCK_TYPE_MESSAGES[entry.type])} ·{" "}
                      {formatDate(entry.trashed_at, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoring === entry.id}
                        data-cy={`trash-restore-${entry.id}`}
                        onClick={async () => {
                          setRestoring(entry.id)
                          try {
                            await restore(entry.id)
                          } finally {
                            setRestoring(null)
                          }
                        }}
                      >
                        <Undo2Icon data-icon="inline-start" />
                        {t("Restore")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        data-cy={`trash-delete-permanently-${entry.id}`}
                        onClick={() => {
                          setDeleteError(false)
                          setPendingDelete(entry)
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        {t("Delete")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
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
