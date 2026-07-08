"use client"

import { useEffect, useState } from "react"
import { FileTextIcon, Undo2Icon } from "lucide-react"

import { usePages } from "@/components/pages/page-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { trash, refreshTrash, restore, canWrite } = usePages()
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

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
          <div className="space-y-2">
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
          <ul className="space-y-2">
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
                    {entry.type} · {new Date(entry.trashed_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canWrite || restoring === entry.id}
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
                  <Undo2Icon />
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
