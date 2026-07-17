"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { FileTextIcon, PlusIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenuProvider } from "@/components/command/organisms/command-menu-provider"
import { EditorPage } from "@/components/editor/editor-page"
import { PageLayoutProvider } from "@/components/editor/page-layout-provider"
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
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { isUnauthorizedApiError } from "@/lib/api"
import { RequireAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

function EmptyWorkspace() {
  const router = useRouter()
  const { canWrite, createTopLevelPage } = usePages()
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)

  return (
    <div
      className="relative grid min-h-svh place-items-center"
      data-cy="workspace-empty"
    >
      <SidebarTrigger
        className="absolute top-2 left-2 md:hidden"
        aria-label={t("Toggle sidebar")}
      />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{t("No pages")}</EmptyTitle>
          <EmptyDescription>
            {t("This workspace has no pages yet. Create the first one.")}
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
              {t("New page")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  )
}

function DashboardContent({ children }: { children: ReactNode }) {
  const { currentPageId, pages, loading } = usePages()

  return (
    <CommandMenuProvider pages={pages}>
      <SidebarProvider
        style={
          {
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset className="bg-background">
          {children}
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

export function DashboardShell({ children }: { children: ReactNode }) {
  const params = useParams<{ pageId?: string | string[] }>()
  const pageId = typeof params.pageId === "string" ? params.pageId : undefined

  return (
    <RequireAuth>
      <PageLayoutProvider>
        <WorkspaceProvider>
          <PageProvider pageId={pageId}>
            <DashboardContent>{children}</DashboardContent>
          </PageProvider>
        </WorkspaceProvider>
      </PageLayoutProvider>
    </RequireAuth>
  )
}
