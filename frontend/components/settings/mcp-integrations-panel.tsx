"use client"

import { useEffect, useState, type FormEvent } from "react"
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

const scopeOptions: Array<{
  value: McpScope
  label: string
  description: string
}> = [
  {
    value: "content:read",
    label: "Ler notas",
    description: "Lista páginas e lê árvores de blocos.",
  },
  {
    value: "content:write",
    label: "Editar notas",
    description: "Aplica operações quando seu papel permitir escrita.",
  },
  {
    value: "search:read",
    label: "Pesquisar",
    description: "Usa a busca semântica do workspace.",
  },
  {
    value: "media:read",
    label: "Ver imagens",
    description: "Retorna blocos de imagem autorizados.",
  },
]

export function McpIntegrationsPanel() {
  const { token } = useAuth()
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
  const [created, setCreated] =
    useState<CreatedMcpIntegrationToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
            setError(
              caught instanceof ApiError
                ? caught.message
                : "Não foi possível carregar as integrações."
            )
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
          : "Não foi possível criar o token."
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
          : "Não foi possível revogar o token."
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
          <CardTitle>Conectar um agente</CardTitle>
          <CardDescription>
            Crie uma credencial limitada para OpenCode, Claude ou outro cliente
            MCP acessar o Reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mcp-token-name">Nome da integração</FieldLabel>
                <Input
                  id="mcp-token-name"
                  placeholder="Ex.: OpenCode no MacBook"
                  maxLength={100}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <FieldDescription>
                  Use um nome que identifique onde o token será usado.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Validade</FieldLabel>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="7">7 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                      <SelectItem value="365">1 ano</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <FieldSet>
              <FieldLegend>Workspaces liberados</FieldLegend>
              <FieldDescription>
                O agente só acessa os workspaces selecionados enquanto você
                continuar como membro.
              </FieldDescription>
              <FieldGroup data-slot="checkbox-group" className="grid sm:grid-cols-2">
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
                      <FieldDescription>{workspace.role}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Permissões</FieldLegend>
              <FieldDescription>
                Você pode revogar o token a qualquer momento.
              </FieldDescription>
              <FieldGroup data-slot="checkbox-group" className="grid sm:grid-cols-2">
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
                        {scope.label}
                      </FieldLabel>
                      <FieldDescription>{scope.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Button type="submit" className="w-fit" disabled={pending || !ready}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <KeyRoundIcon data-icon="inline-start" />
              )}
              Criar token
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
          <AlertTitle>Token criado. Guarde agora.</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>Por segurança, este valor não será exibido novamente.</p>
            <InputGroup>
              <InputGroupInput
                aria-label="Token MCP criado"
                readOnly
                value={created.token}
                className="font-mono"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => void handleCopy()}>
                  <CopyIcon data-icon="inline-start" />
                  {copied ? "Copiado" : "Copiar"}
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
              Já guardei o token
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
