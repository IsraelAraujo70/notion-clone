"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { Trash2Icon } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  ApiError,
  api,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

const roles: WorkspaceRole[] = ["owner", "editor", "viewer"]

export function WorkspaceMembersPanel() {
  const { token, user } = useAuth()
  const { t } = useI18n()
  const { activeWorkspace, deleteWorkspace, selectWorkspace, workspaces } =
    useWorkspace()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<WorkspaceRole>("editor")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const reportLoadError = useEffectEvent((caught: unknown) => {
    setError(
      caught instanceof ApiError ? caught.message : t("Could not load members.")
    )
  })

  const isOwner = activeWorkspace?.role === "owner"
  const roleLabel = (workspaceRole: WorkspaceRole) => {
    if (workspaceRole === "owner") return t("Owner")
    if (workspaceRole === "editor") return t("Editor")
    return t("Viewer")
  }
  const ownerCount = useMemo(
    () => members.filter((member) => member.role === "owner").length,
    [members]
  )

  const load = useCallback(async () => {
    if (!token || !activeWorkspace) {
      return
    }
    const [nextMembers, nextInvites] = await Promise.all([
      api.listWorkspaceMembers(token, activeWorkspace.id),
      activeWorkspace.role === "owner"
        ? api.listWorkspaceInvites(token, activeWorkspace.id)
        : Promise.resolve([]),
    ])
    setMembers(nextMembers)
    setInvites(nextInvites)
  }, [activeWorkspace, token])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setDeleteConfirmation("")
      void load().catch((caught) => {
        reportLoadError(caught)
      })
    })

    return () => {
      cancelled = true
    }
  }, [load])

  async function handleInvite(event: FormEvent) {
    event.preventDefault()
    if (!token || !activeWorkspace) {
      return
    }
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await api.inviteWorkspaceMember(token, activeWorkspace.id, {
        email,
        role,
      })
      setEmail("")
      setRole("editor")
      setNotice(t("Invitation sent."))
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not send the invitation.")
      )
    } finally {
      setPending(false)
    }
  }

  async function updateRole(member: WorkspaceMember, nextRole: WorkspaceRole) {
    if (!token || !activeWorkspace) {
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.updateWorkspaceMemberRole(
        token,
        activeWorkspace.id,
        member.user_id,
        nextRole
      )
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not change the role.")
      )
    } finally {
      setPending(false)
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!token || !activeWorkspace) {
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.removeWorkspaceMember(token, activeWorkspace.id, member.user_id)
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not remove the member.")
      )
    } finally {
      setPending(false)
    }
  }

  async function revokeInvite(invite: WorkspaceInvite) {
    if (!token || !activeWorkspace) {
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.revokeWorkspaceInvite(token, activeWorkspace.id, invite.id)
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not revoke the invitation.")
      )
    } finally {
      setPending(false)
    }
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace || !isOwner) {
      return
    }
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await deleteWorkspace(activeWorkspace.id)
      setDeleteConfirmation("")
      setNotice(t("Workspace deleted."))
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not delete the workspace.")
      )
    } finally {
      setPending(false)
    }
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">{t("No workspace.")}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_240px] md:items-end">
          <div>
            <h3 className="font-medium">{t("Workspace")}</h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "Choose the workspace before managing members, invitations, and pages."
              )}
            </p>
          </div>
          <Field>
            <FieldLabel>{t("Selected workspace")}</FieldLabel>
            <Select
              value={activeWorkspace.id}
              onValueChange={(workspaceId) => selectWorkspace(workspaceId)}
            >
              <SelectTrigger
                className="w-full"
                data-cy="settings-workspace-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{activeWorkspace.name}</Badge>
          <span>
            {t("Your role: {role}", { role: roleLabel(activeWorkspace.role) })}
          </span>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      )}
      {!isOwner && (
        <Alert>
          <AlertTitle>
            {t("Only owners can manage members and invitations.")}
          </AlertTitle>
        </Alert>
      )}
      {isOwner && (
        <form
          data-cy="workspace-invite-form"
          onSubmit={handleInvite}
          className="flex flex-col gap-3 rounded-xl border p-4"
        >
          <div>
            <h3 className="font-medium">{t("Invitations")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Send access by email to the selected workspace.")}
            </p>
          </div>
          <FieldGroup className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
            <Field>
              <FieldLabel htmlFor="invite-email">{t("Email")}</FieldLabel>
              <Input
                id="invite-email"
                data-cy="workspace-invite-email"
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("Role")}</FieldLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as WorkspaceRole)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roles.map((item) => (
                      <SelectItem key={item} value={item}>
                        {roleLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="justify-end">
              <Button
                type="submit"
                data-cy="workspace-invite-submit"
                disabled={pending || !email.trim()}
              >
                {pending && <Spinner data-icon="inline-start" />}
                {t("Send invitation")}
              </Button>
            </Field>
          </FieldGroup>
          <FieldDescription>
            {t("The invitation expires in 7 days and is sent by email.")}
          </FieldDescription>
        </form>
      )}

      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <h3 className="font-medium">{t("Members")}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("User")}</TableHead>
              <TableHead>{t("Role")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const lastOwner = member.role === "owner" && ownerCount <= 1
              return (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{member.display_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isOwner ? (
                      <Select
                        value={member.role}
                        disabled={pending || lastOwner}
                        onValueChange={(value) =>
                          updateRole(member, value as WorkspaceRole)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {roles.map((item) => (
                              <SelectItem key={item} value={item}>
                                {roleLabel(item)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">
                        {roleLabel(member.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isOwner && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("Remove {email}", {
                          email: member.email,
                        })}
                        disabled={
                          pending ||
                          lastOwner ||
                          (member.user_id === user?.id && lastOwner)
                        }
                        onClick={() => removeMember(member)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {isOwner && (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="font-medium">{t("Pending invitations")}</h3>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("No pending invitations.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Email")}</TableHead>
                  <TableHead>{t("Role")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{roleLabel(invite.role)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => revokeInvite(invite)}
                      >
                        {t("Revoke")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {isOwner && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-medium text-destructive">{t("Danger zone")}</h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "Deleting the workspace removes pages, members, invitations, and history. This action is permanent."
              )}
            </p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field>
              <FieldLabel htmlFor="delete-workspace-confirmation">
                {t("Type {workspace} to confirm", {
                  workspace: activeWorkspace.name,
                })}
              </FieldLabel>
              <Input
                id="delete-workspace-confirmation"
                data-cy="delete-workspace-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="destructive"
              data-cy="delete-workspace-submit"
              disabled={
                pending || deleteConfirmation.trim() !== activeWorkspace.name
              }
              onClick={() => void handleDeleteWorkspace()}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {t("Delete workspace")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
