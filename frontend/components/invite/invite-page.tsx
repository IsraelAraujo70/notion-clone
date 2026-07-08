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

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
}

const statusCopy: Record<WorkspaceInvitePreview["status"], string> = {
  pending: "Convite pendente",
  accepted: "Este convite já foi aceito.",
  expired: "Este convite expirou.",
  revoked: "Este convite foi revogado.",
}

export function InvitePage({ token }: { token: string }) {
  const router = useRouter()
  const { loading: authLoading, token: authToken, user } = useAuth()
  const [preview, setPreview] = useState<WorkspaceInvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
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
                ? caught.message
                : "Não foi possível carregar o convite."
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
          ? caught.message
          : "Não foi possível aceitar o convite."
      )
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Carregando convite...
      </div>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">
          Convite de workspace
        </CardTitle>
        <CardDescription>
          Entre no workspace compartilhado do reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}
        {!token && (
          <Alert variant="destructive">
            <AlertTitle>Convite inválido.</AlertTitle>
          </Alert>
        )}
        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm text-muted-foreground">Workspace</p>
              <p className="font-medium">{preview.workspace_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email convidado</p>
              <p className="font-medium">{preview.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{roleLabels[preview.role]}</Badge>
              <Badge variant="outline">{statusCopy[preview.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Expira em {new Date(preview.expires_at).toLocaleString("pt-BR")}.
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
              {accepting ? "Aceitando..." : "Aceitar convite"}
            </Button>
          ) : (
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Button asChild>
                <Link href={`/signup?invite=${token}`}>Criar conta</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/login?invite=${token}`}>Entrar</Link>
              </Button>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
