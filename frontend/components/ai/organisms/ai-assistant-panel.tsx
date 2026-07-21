import {
  ArrowUpIcon,
  FileTextIcon,
  HistoryIcon,
  PlusIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import type { PageSummary } from "@/lib/api"
import type {
  AiAction,
  AiCitation,
  AiConversation,
  AiMessage,
} from "@reason/core/ai/contracts"
import { activePageMention, insertPageMention } from "@/lib/ai/page-mentions"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { AiActionControls } from "../molecules/ai-action-controls"
import { AiEmptyState } from "../molecules/ai-empty-state"
import { AiOperationApproval } from "../molecules/ai-operation-approval"
import { AiConversationTimeline } from "./ai-conversation-timeline"
import type {
  AiCompletedActivity,
  AiOperationApproval as Approval,
  AiToolActivity,
} from "./use-ai-assistant-controller"

type Props = {
  surface?: "floating" | "page"
  showHistory: boolean
  conversations: AiConversation[]
  pages: PageSummary[]
  messages: AiMessage[]
  activities: AiCompletedActivity[]
  streamedText: string
  tools: AiToolActivity[]
  approvals: Approval[]
  busy: boolean
  stopping: boolean
  error: string | null
  status: string | null
  draft: string
  mentionedPageIds: string[]
  canWrite: boolean
  pageId?: string
  pageBlockIds: string[]
  selectedBlockIds: string[]
  showPageActions?: boolean
  showClose?: boolean
  onNewConversation: () => void
  onToggleHistory: () => void
  onSelectConversation: (id: string) => void
  onAction: (action: AiAction, prompt: string) => void
  onOpenCitation: (citation: AiCitation) => void
  onDraftChange: (draft: string) => void
  onMentionPage: (pageId: string, draft: string) => void
  onSubmit: () => void
  onCancel: () => void
  onApprovalDecision: (
    proposalId: string,
    approved: boolean,
    allowConversation?: boolean
  ) => void
  onClose: () => void
}

export function AiAssistantPanel(props: Props) {
  const { formatDate, t } = useI18n()
  const isPage = props.surface === "page"
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(128)
  const [cursor, setCursor] = useState(props.draft.length)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const activeApproval = props.approvals.find(
    (approval) =>
      approval.status === "pending" || approval.status === "deciding"
  )
  const timelineApprovals = activeApproval
    ? props.approvals.filter(
        (approval) => approval.proposalId !== activeApproval.proposalId
      )
    : props.approvals
  const mention = activePageMention(props.draft, cursor)
  const matchingPages = useMemo(() => {
    if (!mention) return []
    const query = mention.query.toLocaleLowerCase()
    return props.pages
      .filter((page) => page.title.toLocaleLowerCase().includes(query))
      .slice(0, 8)
  }, [mention, props.pages])

  useEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setComposerHeight(entry.contentRect.height)
    })
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  const selectMention = (page: PageSummary) => {
    if (!mention) return
    const inserted = insertPageMention(
      props.draft,
      mention,
      page.title || t("Untitled")
    )
    props.onMentionPage(page.id, inserted.value)
    setCursor(inserted.cursor)
    queueMicrotask(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor)
    })
  }

  const pickSuggestion = (prompt: string) => {
    props.onDraftChange(prompt)
    setCursor(prompt.length)
    queueMicrotask(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(prompt.length, prompt.length)
    })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-manila-strong" />
          <h2 className="text-sm font-medium">{t("Reason AI")}</h2>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("New conversation")}
            disabled={props.busy}
            onClick={props.onNewConversation}
          >
            <PlusIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("Conversation history")}
            aria-pressed={props.showHistory}
            aria-expanded={props.showHistory}
            aria-controls="ai-conversation-history"
            disabled={props.busy}
            onClick={props.onToggleHistory}
          >
            <HistoryIcon />
          </Button>
          {props.showClose !== false ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("Close Reason AI")}
              onClick={props.onClose}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>
      {props.showHistory ? (
        <div
          id="ai-conversation-history"
          className="min-h-0 flex-1 overflow-y-auto p-2"
          aria-label={t("Conversations")}
        >
          <div className={cn(isPage && "mx-auto w-full max-w-2xl space-y-0.5")}>
            {props.conversations.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t("No conversations yet.")}
              </p>
            ) : (
              props.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => props.onSelectConversation(conversation.id)}
                >
                  <span className="block truncate font-medium">
                    {conversation.title || t("New conversation")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(conversation.updated_at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          {props.showPageActions !== false && props.pageId ? (
            <div className="border-b px-4 py-2.5">
              <AiActionControls
                canWrite={props.canWrite}
                pageId={props.pageId}
                pageBlockIds={props.pageBlockIds}
                selectedBlockIds={props.selectedBlockIds}
                onAction={props.onAction}
              />
              {!props.canWrite ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    "You can ask about the workspace. Actions that change blocks require edit access."
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {props.messages.length === 0 &&
            props.tools.length === 0 &&
            props.approvals.length === 0 &&
            !props.busy &&
            isPage ? (
              <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
                <AiEmptyState onPick={pickSuggestion} />
                {props.error ? (
                  <p
                    role="alert"
                    className="px-4 pb-4 text-center text-sm text-destructive"
                  >
                    {props.error}
                  </p>
                ) : null}
                {props.status ? (
                  <p
                    role="status"
                    className="px-4 pb-4 text-center text-xs text-muted-foreground"
                  >
                    {props.status}
                  </p>
                ) : null}
              </div>
            ) : (
              <AiConversationTimeline
                isPage={isPage}
                messages={props.messages}
                activities={props.activities}
                streamedText={props.streamedText}
                tools={props.tools}
                approvals={timelineApprovals}
                busy={props.busy}
                error={props.error}
                status={props.status}
                bottomInset={composerHeight}
                onOpenCitation={props.onOpenCitation}
                onApprovalDecision={props.onApprovalDecision}
              />
            )}
          </div>
          <div
            ref={composerRef}
            data-testid="ai-composer-overlay"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 via-75% to-transparent px-3 pt-10 pb-3 md:px-4 md:pb-4"
          >
            <div
              className={cn(
                "pointer-events-auto relative",
                isPage && "mx-auto w-full max-w-2xl"
              )}
            >
              {activeApproval ? (
                <div className="mb-2">
                  <AiOperationApproval
                    approval={activeApproval}
                    onDecision={(approved, allowConversation) =>
                      props.onApprovalDecision(
                        activeApproval.proposalId,
                        approved,
                        allowConversation
                      )
                    }
                  />
                </div>
              ) : null}
              {mention ? (
                <Command
                  label={t("Mention page")}
                  className="absolute inset-x-0 bottom-full mb-2 h-auto border shadow-md"
                  shouldFilter={false}
                  value={
                    matchingPages[activeMentionIndex % matchingPages.length]?.id
                  }
                >
                  <CommandList label={t("Mention page")}>
                    {matchingPages.length === 0 ? (
                      <CommandEmpty>{t("No pages found.")}</CommandEmpty>
                    ) : (
                      <CommandGroup heading={t("Pages")}>
                        {matchingPages.map((page) => (
                          <CommandItem
                            key={page.id}
                            value={page.id}
                            data-checked={props.mentionedPageIds.includes(
                              page.id
                            )}
                            onPointerDown={(event) => {
                              event.preventDefault()
                              selectMention(page)
                            }}
                          >
                            <FileTextIcon />
                            <span className="truncate">
                              {page.icon ? `${page.icon} ` : ""}
                              {page.title || t("Untitled")}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              ) : null}
              <div className="rounded-2xl border border-border bg-background shadow-sm transition focus-within:ring-1 focus-within:ring-ring/20">
                <Textarea
                  ref={textareaRef}
                  value={props.draft}
                  onChange={(event) => {
                    props.onDraftChange(event.target.value)
                    setCursor(event.target.selectionStart)
                  }}
                  onClick={(event) =>
                    setCursor(event.currentTarget.selectionStart)
                  }
                  onSelect={(event) =>
                    setCursor(event.currentTarget.selectionStart)
                  }
                  onKeyDown={(event) => {
                    if (mention && matchingPages.length > 0) {
                      if (
                        event.key === "ArrowDown" ||
                        event.key === "ArrowUp"
                      ) {
                        event.preventDefault()
                        const direction = event.key === "ArrowDown" ? 1 : -1
                        setActiveMentionIndex(
                          (current) =>
                            (current + direction + matchingPages.length) %
                            matchingPages.length
                        )
                        return
                      }
                      if (event.key === "Enter" || event.key === "Tab") {
                        event.preventDefault()
                        selectMention(
                          matchingPages[
                            activeMentionIndex % matchingPages.length
                          ]
                        )
                        return
                      }
                    }
                    if (mention && event.key === "Escape") {
                      event.preventDefault()
                      setCursor(mention.start)
                      return
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      props.onSubmit()
                    }
                  }}
                  aria-label={t("Message to Reason AI")}
                  placeholder={t("Ask about your workspace...")}
                  className="max-h-40 min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                  <span className="text-[11px] text-muted-foreground">
                    {isPage
                      ? t("Type @ to mention a page")
                      : t("Enter sends · Shift+Enter inserts a line break")}
                  </span>
                  {props.busy ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={props.stopping}
                      onClick={props.onCancel}
                    >
                      <SquareIcon />
                      {props.stopping
                        ? t("Stopping display...")
                        : t("Stop display")}
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      className="size-8 rounded-full"
                      aria-label={t("Send")}
                      disabled={!props.draft.trim()}
                      onClick={props.onSubmit}
                    >
                      <ArrowUpIcon />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
