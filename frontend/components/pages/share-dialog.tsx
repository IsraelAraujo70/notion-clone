"use client"

import { useEffect, useState } from "react"
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  Share2Icon,
  UnlinkIcon,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { api, ApiError, type PublicLinkResponse } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

export function ShareDialog({
  pageId,
  canWrite,
}: {
  pageId: string
  canWrite: boolean
}) {
  const { token } = useAuth()
  const { t } = useI18n()
  const { activeWorkspaceId } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<PublicLinkResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !token || !activeWorkspaceId || !canWrite) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(false)
      setCopied(false)
      void api
        .getPublicLink(token, activeWorkspaceId, pageId)
        .then((activeLink) => {
          if (!cancelled) setLink(activeLink)
        })
        .catch((nextError: unknown) => {
          if (cancelled) return
          if (nextError instanceof ApiError && nextError.status === 404) {
            setLink(null)
          } else {
            setError(true)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, canWrite, open, pageId, token])

  if (!canWrite) return null

  const createLink = async () => {
    if (!token || !activeWorkspaceId) return
    setSaving(true)
    setError(false)
    try {
      setLink(await api.createPublicLink(token, activeWorkspaceId, pageId))
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const revokeLink = async () => {
    if (!token || !activeWorkspaceId) return
    setSaving(true)
    setError(false)
    try {
      await api.revokePublicLink(token, activeWorkspaceId, pageId)
      setLink(null)
      setCopied(false)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setError(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-cy="share-open">
          <Share2Icon data-icon="inline-start" />
          {t("Share")}
        </Button>
      </DialogTrigger>
      <DialogContent data-cy="share-dialog">
        <DialogHeader>
          <DialogTitle>{t("Share page")}</DialogTitle>
          <DialogDescription>
            {t(
              "Anyone with the link can view this page. Subpages will not be published."
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div
            className="flex items-center justify-center py-8"
            data-cy="share-loading"
          >
            <Spinner />
          </div>
        ) : error ? (
          <Alert variant="destructive" data-cy="share-error">
            <AlertDescription>
              {t("Could not update sharing. Try again.")}
            </AlertDescription>
          </Alert>
        ) : link ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label={t("Public link")}
                value={link.url}
                data-cy="share-url"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t("Copy link")}
                data-cy="share-copy"
                onClick={copyLink}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </div>
            {copied ? (
              <p role="status" className="text-xs text-muted-foreground">
                {t("Link copied.")}
              </p>
            ) : null}
          </div>
        ) : (
          <Alert>
            <LinkIcon />
            <AlertDescription>
              {t("This page is still private.")}
            </AlertDescription>
          </Alert>
        )}

        {!loading ? (
          <DialogFooter>
            {link ? (
              <Button
                variant="destructive"
                disabled={saving}
                data-cy="share-revoke"
                onClick={revokeLink}
              >
                {saving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <UnlinkIcon data-icon="inline-start" />
                )}
                {t("Revoke link")}
              </Button>
            ) : (
              <Button
                disabled={saving}
                data-cy="share-create"
                onClick={createLink}
              >
                {saving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <LinkIcon data-icon="inline-start" />
                )}
                {t("Create public link")}
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
