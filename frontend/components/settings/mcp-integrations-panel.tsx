"use client"

import { useEffect, useEffectEvent, useState, type FormEvent } from "react"
import { CopyIcon, KeyRoundIcon } from "lucide-react"

import { McpTokenList } from "@/components/settings/mcp-token-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  ApiError,
  api,
  type CreatedMcpIntegrationToken,
  type McpIntegrationToken,
  type McpScope,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"

const scopeOptions: Array<{
  value: McpScope
  label: Message
  description: Message
}> = [
  {
    value: "content:read",
    label: "Read notes",
    description: "Lists pages and reads block trees.",
  },
  {
    value: "content:write",
    label: "Edit notes",
    description: "Applies operations when your role allows writing.",
  },
  {
    value: "search:read",
    label: "Search",
    description: "Uses the workspace's semantic search.",
  },
  {
    value: "media:read",
    label: "View images",
    description: "Returns authorized image blocks.",
  },
]

export function McpIntegrationsPanel() {
  const { token } = useAuth()
  const { t } = useI18n()
  const { activeWorkspace, workspaces } = useWorkspace()
  const [integrations, setIntegrations] = useState<McpIntegrationToken[]>([])
  const [name, setName] = useState("")
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(
    activeWorkspace ? [activeWorkspace.id] : []
  )
  const [scopes, setScopes] = useState<McpScope[]>(
    scopeOptions.map((scope) => scope.value)
  )
  const [expiresInDays, setExpiresInDays] = useState("30")
  const [created, setCreated] = useState<CreatedMcpIntegrationToken | null>(
    null
  )
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const reportLoadError = useEffectEvent((caught: unknown) => {
    setError(
      caught instanceof ApiError
        ? caught.message
        : t("Could not load integrations.")
    )
  })

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!token || cancelled) return
      void api
        .listMcpTokens(token)
        .then((items) => {
          if (!cancelled) setIntegrations(items)
        })
        .catch((caught) => {
          if (!cancelled) {
            reportLoadError(caught)
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [token])

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    setWorkspaceIds((current) =>
      checked
        ? [...new Set([...current, workspaceId])]
        : current.filter((id) => id !== workspaceId)
    )
  }

  function toggleScope(scope: McpScope, checked: boolean) {
    setScopes((current) =>
      checked
        ? [...new Set([...current, scope])]
        : current.filter((item) => item !== scope)
    )
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setPending(true)
    setError(null)
    setCreated(null)
    setCopied(false)
    try {
      const result = await api.createMcpToken(token, {
        name: name.trim(),
        scopes,
        workspace_ids: workspaceIds,
        expires_in_days: Number(expiresInDays),
      })
      setCreated(result)
      setIntegrations((current) => [result.integration, ...current])
      setName("")
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not create the token.")
      )
    } finally {
      setPending(false)
    }
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
  }

  async function handleRevoke(integration: McpIntegrationToken) {
    if (!token) return
    setPending(true)
    setError(null)
    try {
      await api.revokeMcpToken(token, integration.id)
      setIntegrations((current) =>
        current.map((item) =>
          item.id === integration.id
            ? { ...item, revoked_at: new Date().toISOString() }
            : item
        )
      )
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not revoke the token.")
      )
    } finally {
      setPending(false)
    }
  }

  const ready = name.trim() && workspaceIds.length > 0 && scopes.length > 0

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("Connect an agent")}</CardTitle>
          <CardDescription>
            {t(
              "Create a limited credential for OpenCode, Claude, or another MCP client to access Reason."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mcp-token-name">
                  {t("Integration name")}
                </FieldLabel>
                <Input
                  id="mcp-token-name"
                  placeholder={t("E.g. OpenCode on MacBook")}
                  maxLength={100}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <FieldDescription>
                  {t(
                    "Use a name that identifies where the token will be used."
                  )}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("Expiration")}</FieldLabel>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="7">{t("7 days")}</SelectItem>
                      <SelectItem value="30">{t("30 days")}</SelectItem>
                      <SelectItem value="90">{t("90 days")}</SelectItem>
                      <SelectItem value="365">{t("1 year")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <FieldSet>
              <FieldLegend>{t("Allowed workspaces")}</FieldLegend>
              <FieldDescription>
                {t(
                  "The agent can only access selected workspaces while you remain a member."
                )}
              </FieldDescription>
              <FieldGroup
                data-slot="checkbox-group"
                className="grid sm:grid-cols-2"
              >
                {workspaces.map((workspace) => (
                  <Field key={workspace.id} orientation="horizontal">
                    <Checkbox
                      id={`mcp-workspace-${workspace.id}`}
                      checked={workspaceIds.includes(workspace.id)}
                      onCheckedChange={(checked) =>
                        toggleWorkspace(workspace.id, checked === true)
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`mcp-workspace-${workspace.id}`}>
                        {workspace.name}
                      </FieldLabel>
                      <FieldDescription>
                        {workspace.role === "owner"
                          ? t("Owner")
                          : workspace.role === "editor"
                            ? t("Editor")
                            : t("Viewer")}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>{t("Permissions")}</FieldLegend>
              <FieldDescription>
                {t("You can revoke the token at any time.")}
              </FieldDescription>
              <FieldGroup
                data-slot="checkbox-group"
                className="grid sm:grid-cols-2"
              >
                {scopeOptions.map((scope) => (
                  <Field key={scope.value} orientation="horizontal">
                    <Checkbox
                      id={`mcp-scope-${scope.value}`}
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={(checked) =>
                        toggleScope(scope.value, checked === true)
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`mcp-scope-${scope.value}`}>
                        {t(scope.label)}
                      </FieldLabel>
                      <FieldDescription>
                        {t(scope.description)}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Button
              type="submit"
              className="w-fit"
              disabled={pending || !ready}
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <KeyRoundIcon data-icon="inline-start" />
              )}
              {t("Create token")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      {created && (
        <Alert>
          <KeyRoundIcon />
          <AlertTitle>{t("Token created. Save it now.")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>{t("For security, this value will not be shown again.")}</p>
            <InputGroup>
              <InputGroupInput
                aria-label={t("Created MCP token")}
                readOnly
                value={created.token}
                className="font-mono"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => void handleCopy()}>
                  <CopyIcon data-icon="inline-start" />
                  {copied ? t("Copied") : t("Copy")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setCreated(null)}
            >
              {t("I have saved the token")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <McpTokenList
        integrations={integrations}
        workspaces={workspaces}
        pending={pending}
        onRevoke={(integration) => void handleRevoke(integration)}
      />
    </div>
  )
}
