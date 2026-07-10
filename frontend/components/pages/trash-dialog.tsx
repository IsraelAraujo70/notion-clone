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

export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
            <DialogTitle>Lixeira</DialogTitle>
            <DialogDescription>
              Restaurar traz o bloco e toda a subárvore dele de volta à posição
              original.
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
                <EmptyTitle>Lixeira vazia</EmptyTitle>
                <EmptyDescription>
                  Nada foi apagado neste workspace.
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
                      {entry.title || "Sem título"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.type} ·{" "}
                      {new Date(entry.trashed_at).toLocaleString("pt-BR")}
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
                        Restaurar
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
                        Excluir
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
            <DialogTitle>Excluir permanentemente?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title || "Sem título"}” e toda a subárvore serão
              removidas. Imagens associadas também serão apagadas. Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <Alert variant="destructive" data-cy="trash-delete-error">
              <AlertDescription>
                Não foi possível excluir. Tente novamente.
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
              Cancelar
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
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
