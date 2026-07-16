"use client"

import { useState, type FormEvent } from "react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { ApiError } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"

export function CreateWorkspaceDialog({
  onOpenChange,
  open,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { createWorkspace } = useWorkspace()
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await createWorkspace(name)
      setName("")
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not create the workspace.")
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Create workspace")}</DialogTitle>
          <DialogDescription>
            {t("Create a separate space for pages, members, and permissions.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="workspace-name">{t("Name")}</FieldLabel>
              <Input
                id="workspace-name"
                data-cy="workspace-name"
                value={name}
                required
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mx-0 mb-0">
            <Button
              type="submit"
              data-cy="create-workspace-submit"
              disabled={pending || !name.trim()}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? t("Creating...") : t("Create workspace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
