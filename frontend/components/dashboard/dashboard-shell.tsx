"use client"

import { useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { FileTextIcon, PlusIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenuProvider } from "@/components/command/organisms/command-menu-provider"
import { EditorPage } from "@/components/editor/editor-page"
import {
  PageProvider,
  pagePath,
  usePages,
} from "@/components/pages/page-provider"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { isUnauthorizedApiError } from "@/lib/api"
import { RequireAuth } from "@/lib/auth"

function EmptyWorkspace() {
  const router = useRouter()
  const { canWrite, createTopLevelPage } = usePages()
  const [creating, setCreating] = useState(false)

  return (
    <div
      className="grid min-h-svh place-items-center"
      data-cy="workspace-empty"
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>Nenhuma página</EmptyTitle>
          <EmptyDescription>
            Este workspace ainda não tem páginas. Crie a primeira.
          </EmptyDescription>
        </EmptyHeader>
        {canWrite ? (
          <EmptyContent>
            <Button
              disabled={creating}
              data-cy="workspace-empty-create"
              onClick={async () => {
                setCreating(true)
                try {
                  router.push(pagePath(await createTopLevelPage()))
                } catch (error) {
                  if (!isUnauthorizedApiError(error)) {
                    throw error
                  }
                } finally {
                  setCreating(false)
                }
              }}
            >
              <PlusIcon />
              Nova página
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  )
}

function DashboardContent() {
  const { currentPageId, pages, loading } = usePages()

  return (
    <CommandMenuProvider pages={pages}>
      <SidebarProvider
        style={
          {
            // 240px, a medida do sidebar do Notion.
            "--sidebar-width": "15rem",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset className="bg-background">
          {currentPageId ? (
            <EditorPage pageId={currentPageId} />
          ) : !loading && pages.length === 0 ? (
            <EmptyWorkspace />
          ) : (
            // Sem página na URL: o PageProvider está redirecionando para a primeira.
            <div className="grid min-h-svh place-items-center">
              <Spinner />
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </CommandMenuProvider>
  )
}

export function DashboardShell({ pageId }: { pageId?: string }) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <PageProvider pageId={pageId}>
          <DashboardContent />
        </PageProvider>
      </WorkspaceProvider>
    </RequireAuth>
  )
}
