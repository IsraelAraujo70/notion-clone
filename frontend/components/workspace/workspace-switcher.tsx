"use client"

import { CheckIcon, PlusIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import type { WorkspaceRole } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"

export function WorkspaceSwitcher({
  onCreateWorkspace,
}: {
  onCreateWorkspace: () => void
}) {
  const { activeWorkspaceId, loading, selectWorkspace, workspaces } =
    useWorkspace()
  const { t } = useI18n()
  const roleLabels: Record<WorkspaceRole, string> = {
    owner: t("Owner"),
    editor: t("Editor"),
    viewer: t("Viewer"),
  }

  return (
    <>
      <DropdownMenuLabel>{t("Workspaces")}</DropdownMenuLabel>
      <DropdownMenuGroup>
        {loading ? (
          <DropdownMenuItem disabled>
            <Spinner />
            {t("Loading...")}
          </DropdownMenuItem>
        ) : (
          workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              data-cy="workspace-menu-item"
              onSelect={() => selectWorkspace(workspace.id)}
            >
              {workspace.id === activeWorkspaceId ? <CheckIcon /> : <span />}
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <Badge variant="secondary">{roleLabels[workspace.role]}</Badge>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem
          data-cy="create-workspace-menu-item"
          onSelect={onCreateWorkspace}
        >
          <PlusIcon />
          {t("Create workspace")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  )
}
