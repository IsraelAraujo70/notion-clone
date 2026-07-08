"use client"

import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenuProvider } from "@/components/command/organisms/command-menu-provider"
import { EditorPage } from "@/components/editor/editor-page"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { RequireAuth } from "@/lib/auth"

function DashboardContent() {
  return (
    <CommandMenuProvider>
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
          <EditorPage />
        </SidebarInset>
      </SidebarProvider>
    </CommandMenuProvider>
  )
}

export function DashboardShell() {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <DashboardContent />
      </WorkspaceProvider>
    </RequireAuth>
  )
}
