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

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
}

export function WorkspaceSwitcher({
  onCreateWorkspace,
}: {
  onCreateWorkspace: () => void
}) {
  const { activeWorkspaceId, loading, selectWorkspace, workspaces } =
    useWorkspace()

  return (
    <>
      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
      <DropdownMenuGroup>
        {loading ? (
          <DropdownMenuItem disabled>
            <Spinner />
            Carregando...
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
          Criar workspace
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  )
}
