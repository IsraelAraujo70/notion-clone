"use client"

import { PlugZapIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { McpIntegrationToken, Workspace } from "@/lib/api"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function tokenStatus(integration: McpIntegrationToken) {
  if (integration.revoked_at) return "Revogado"
  if (new Date(integration.expires_at).getTime() <= Date.now()) return "Expirado"
  return "Ativo"
}

const scopeLabels: Record<string, string> = {
  "content:read": "Ler notas",
  "content:write": "Editar notas",
  "search:read": "Pesquisar",
  "media:read": "Ver imagens",
}

export function McpTokenList({
  integrations,
  workspaces,
  pending,
  onRevoke,
}: {
  integrations: McpIntegrationToken[]
  workspaces: Workspace[]
  pending: boolean
  onRevoke: (integration: McpIntegrationToken) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">Tokens existentes</h3>
        <p className="text-sm text-muted-foreground">
          Revogue credenciais que você não reconhece ou não usa mais.
        </p>
      </div>
      {integrations.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PlugZapIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum agente conectado</EmptyTitle>
            <EmptyDescription>
              Crie o primeiro token para acessar suas notas pelo MCP.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {integrations.map((integration) => {
            const status = tokenStatus(integration)
            const workspaceNames = integration.workspace_ids
              .map((id) => workspaces.find((workspace) => workspace.id === id)?.name)
              .filter(Boolean)
            return (
              <Card key={integration.id} size="sm">
                <CardHeader>
                  <CardTitle>{integration.name}</CardTitle>
                  <CardDescription>
                    {workspaceNames.join(", ") || "Workspace indisponível"} · expira em{" "}
                    {formatDate(integration.expires_at)}
                  </CardDescription>
                  <CardAction className="flex items-center gap-1">
                    <Badge variant={status === "Ativo" ? "secondary" : "outline"}>
                      {status}
                    </Badge>
                    {status === "Ativo" && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Revogar ${integration.name}`}
                        disabled={pending}
                        onClick={() => onRevoke(integration)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {integration.scopes.map((scope) => (
                    <Badge key={scope} variant="outline">
                      {scopeLabels[scope] ?? scope}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
