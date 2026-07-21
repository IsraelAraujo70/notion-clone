"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { useDashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import type { PageSummary } from "@/lib/api"
import { useIsMobile } from "@/hooks/use-mobile"
import { citationPath } from "@/lib/ai/citations"
import type { AiAction, AiCitation } from "@reason/core/ai/contracts"
import type { Operation } from "@reason/core/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { AiAssistantPanel } from "./ai-assistant-panel"
import { useAiAssistantController } from "./use-ai-assistant-controller"

type Props = {
  token: string
  workspaceId: string
  pages: PageSummary[]
  pageId?: string
  pageBlockIds: string[]
  selectedBlockIds: string[]
  anchorBlockId: string | null
  canWrite: boolean
  requestedAction: AiAction | null
  onRequestedActionHandled: () => void
  onRunCompleted: (groupId: string, lastSeq: number) => void
  onOperationApproved?: (operation: Operation) => void
  onBeforeMutatingAction: () => Promise<void>
  variant?: "floating" | "page"
}

export function AiAssistant(props: Props) {
  const variant = props.variant ?? "floating"
  const router = useRouter()
  const { openPath } = useDashboardTabs()
  const isMobile = useIsMobile()
  const { t } = useI18n()
  const { selectWorkspace } = useWorkspace()
  const [open, setOpen] = useState(variant === "page")
  const launcherRef = useRef<HTMLButtonElement>(null)
  const controller = useAiAssistantController({
    token: props.token,
    workspaceId: props.workspaceId,
    pages: props.pages,
    pageId: props.pageId,
    selectedBlockIds: props.selectedBlockIds,
    anchorBlockId: props.anchorBlockId,
    requestedAction: props.requestedAction,
    onRequestedActionHandled: props.onRequestedActionHandled,
    onRunCompleted: props.onRunCompleted,
    onOperationApproved: props.onOperationApproved ?? (() => {}),
    onBeforeMutatingAction: props.onBeforeMutatingAction,
    onRequestOpen: () => setOpen(true),
  })

  const closeAssistant = useCallback(() => {
    setOpen(false)
    queueMicrotask(() => launcherRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open || isMobile || variant === "page") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeAssistant, isMobile, open, variant])

  const openCitation = (citation: AiCitation) => {
    const path = citationPath(citation)
    closeAssistant()
    if (citation.workspace_id !== props.workspaceId) {
      selectWorkspace(citation.workspace_id)
      router.push(path)
      return
    }
    openPath(path, { title: citation.page_title })
  }

  const content = (
    <AiAssistantPanel
      surface={variant}
      showHistory={controller.showHistory}
      conversations={controller.conversations}
      pages={props.pages}
      messages={controller.messages}
      activities={controller.activities}
      streamedText={controller.streamedText}
      tools={controller.tools}
      approvals={controller.approvals}
      busy={controller.busy}
      error={controller.error}
      status={controller.status}
      stopping={controller.stopping}
      draft={controller.draft}
      mentionedPageIds={controller.mentionedPageIds}
      canWrite={props.canWrite}
      pageId={props.pageId}
      pageBlockIds={props.pageBlockIds}
      selectedBlockIds={props.selectedBlockIds}
      showPageActions={variant === "floating"}
      showClose={variant === "floating"}
      onNewConversation={controller.newConversation}
      onToggleHistory={controller.toggleHistory}
      onSelectConversation={controller.selectConversation}
      onAction={controller.queueAction}
      onOpenCitation={openCitation}
      onDraftChange={controller.changeDraft}
      onMentionPage={controller.mentionPage}
      onSubmit={controller.submit}
      onCancel={controller.cancel}
      onApprovalDecision={controller.decideOperation}
      onClose={closeAssistant}
    />
  )

  if (variant === "page") {
    return (
      <section
        className="flex h-full min-h-0 w-full flex-col bg-background"
        aria-label={t("Reason AI")}
        data-cy="ai-workspace-page"
      >
        {content}
      </section>
    )
  }

  return (
    <>
      <Button
        ref={launcherRef}
        className="fixed right-4 bottom-4 z-40 h-11 rounded-full px-4 shadow-lg md:right-6 md:bottom-6"
        aria-label={t("Open Reason AI")}
        onClick={() => setOpen(true)}
      >
        <SparklesIcon /> {t("Ask AI")}
      </Button>
      {isMobile ? (
        <Sheet
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : closeAssistant())}
        >
          <SheetContent
            side="bottom"
            className="h-[88svh] gap-0 rounded-t-2xl p-0"
            aria-describedby="ai-sheet-description"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t("Reason AI")}</SheetTitle>
              <SheetDescription id="ai-sheet-description">
                {t("Workspace assistant")}
              </SheetDescription>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      ) : open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={t("Reason AI")}
          className="fixed right-6 bottom-20 z-40 flex h-[min(680px,calc(100svh-7rem))] w-[400px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
        >
          {content}
        </section>
      ) : null}
    </>
  )
}
