"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  ApiError,
  api,
  type WorkspaceInvitePreview,
  type WorkspaceRole,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

type InviteError =
  | { kind: "server"; message: string }
  | { kind: "load" | "accept" }

export function InvitePage({ token }: { token: string }) {
  const router = useRouter()
  const { loading: authLoading, token: authToken, user } = useAuth()
  const { formatDate, t } = useI18n()
  const roleLabels: Record<WorkspaceRole, string> = {
    owner: t("Owner"),
    editor: t("Editor"),
    viewer: t("Viewer"),
  }
  const statusCopy: Record<WorkspaceInvitePreview["status"], string> = {
    pending: t("Invite pending"),
    accepted: t("This invite has already been accepted."),
    expired: t("This invite has expired."),
    revoked: t("This invite has been revoked."),
  }
  const [preview, setPreview] = useState<WorkspaceInvitePreview | null>(null)
  const [error, setError] = useState<InviteError | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setLoading(true)
      api
        .getWorkspaceInvite(token)
        .then((nextPreview) => {
          if (!cancelled) {
            setPreview(nextPreview)
            setError(null)
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(
              caught instanceof ApiError
                ? { kind: "server", message: caught.message }
                : { kind: "load" }
            )
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    })

    return () => {
      cancelled = true
    }
  }, [token])

  async function acceptInvite() {
    if (!authToken) {
      return
    }

    setAccepting(true)
    setError(null)
    try {
      await api.acceptWorkspaceInvite(authToken, token)
      router.replace("/dashboard")
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? { kind: "server", message: caught.message }
          : { kind: "accept" }
      )
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t("Loading invite...")}
      </div>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">
          {t("Workspace invitation")}
        </CardTitle>
        <CardDescription>
          {t("Join the shared Reason workspace.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>
              {error.kind === "server"
                ? error.message
                : error.kind === "load"
                  ? t("Could not load the invite.")
                  : t("Could not accept the invite.")}
            </AlertTitle>
          </Alert>
        )}
        {!token && (
          <Alert variant="destructive">
            <AlertTitle>{t("Invalid invite.")}</AlertTitle>
          </Alert>
        )}
        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("Workspace")}</p>
              <p className="font-medium">{preview.workspace_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {t("Invited email")}
              </p>
              <p className="font-medium">{preview.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{roleLabels[preview.role]}</Badge>
              <Badge variant="outline">{statusCopy[preview.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("Expires on {date}.", {
                date: formatDate(preview.expires_at, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </p>
          </div>
        )}
      </CardContent>
      {preview?.status === "pending" && (
        <CardFooter className="flex flex-col gap-3">
          {user && authToken ? (
            <Button
              type="button"
              className="w-full"
              disabled={accepting}
              onClick={acceptInvite}
            >
              {accepting && <Spinner data-icon="inline-start" />}
              {accepting ? t("Accepting...") : t("Accept invite")}
            </Button>
          ) : (
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Button asChild>
                <Link href={`/signup?invite=${token}`}>
                  {t("Create account")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/login?invite=${token}`}>{t("Log in")}</Link>
              </Button>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
