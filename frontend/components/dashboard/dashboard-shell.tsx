"use client"

import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenuProvider } from "@/components/command/organisms/command-menu-provider"
import { EditorPage } from "@/components/editor/editor-page"
import { PageProvider, usePages } from "@/components/pages/page-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { RequireAuth } from "@/lib/auth"

function DashboardContent() {
  const { currentPageId, pages } = usePages()

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
          ) : (
            // Sem página na URL: o PageProvider já está redirecionando para a raiz.
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
