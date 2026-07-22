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
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

function tokenStatus(integration: McpIntegrationToken) {
  if (integration.revoked_at) return "revoked"
  if (new Date(integration.expires_at).getTime() <= Date.now()) return "expired"
  return "active"
}

const scopeLabels: Record<string, Message> = {
  "content:read": "Read notes",
  "content:write": "Edit notes",
  "search:read": "Search",
  "media:read": "View images",
  "github:read": "Read pull requests",
  "github:write": "Link pull requests",
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
  const { formatDate, t } = useI18n()

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">{t("Existing tokens")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("Revoke credentials you do not recognize or no longer use.")}
        </p>
      </div>
      {integrations.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PlugZapIcon />
            </EmptyMedia>
            <EmptyTitle>{t("No connected agents")}</EmptyTitle>
            <EmptyDescription>
              {t("Create the first token to access your notes through MCP.")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {integrations.map((integration) => {
            const status = tokenStatus(integration)
            const workspaceNames = integration.workspace_ids
              .map(
                (id) =>
                  workspaces.find((workspace) => workspace.id === id)?.name
              )
              .filter(Boolean)
            return (
              <Card key={integration.id} size="sm">
                <CardHeader>
                  <CardTitle>{integration.name}</CardTitle>
                  <CardDescription>
                    {t("{workspaces} · expires on {date}", {
                      workspaces:
                        workspaceNames.join(", ") || t("Workspace unavailable"),
                      date: formatDate(integration.expires_at, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }),
                    })}
                  </CardDescription>
                  <CardAction className="flex items-center gap-1">
                    <Badge
                      variant={status === "active" ? "secondary" : "outline"}
                    >
                      {status === "active"
                        ? t("Active")
                        : status === "expired"
                          ? t("Expired")
                          : t("Revoked")}
                    </Badge>
                    {status === "active" && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("Revoke {name}", {
                          name: integration.name,
                        })}
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
                      {scopeLabels[scope] ? t(scopeLabels[scope]) : scope}
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
