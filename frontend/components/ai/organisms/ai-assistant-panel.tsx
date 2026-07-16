import {
  FileTextIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"

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
import { AiActionControls } from "../molecules/ai-action-controls"
import { AiMessage as MessageView } from "../molecules/ai-message"

type Props = {
  showHistory: boolean
  conversations: AiConversation[]
  pages: PageSummary[]
  messages: AiMessage[]
  streamedText: string
  tools: string[]
  busy: boolean
  stopping: boolean
  error: string | null
  status: string | null
  draft: string
  mentionedPageIds: string[]
  canWrite: boolean
  pageId: string
  pageBlockIds: string[]
  selectedBlockIds: string[]
  onNewConversation: () => void
  onToggleHistory: () => void
  onSelectConversation: (id: string) => void
  onAction: (action: AiAction, prompt: string) => void
  onOpenCitation: (citation: AiCitation) => void
  onDraftChange: (draft: string) => void
  onMentionPage: (pageId: string, draft: string) => void
  onSubmit: () => void
  onCancel: () => void
  onClose: () => void
}

export function AiAssistantPanel(props: Props) {
  const { formatDate, t } = useI18n()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(props.draft.length)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const mention = activePageMention(props.draft, cursor)
  const matchingPages = useMemo(() => {
    if (!mention) return []
    const query = mention.query.toLocaleLowerCase()
    return props.pages
      .filter((page) => page.title.toLocaleLowerCase().includes(query))
      .slice(0, 8)
  }, [mention, props.pages])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-medium">{t("Reason AI")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("Ask or edit with context")}
          </p>
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
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("Close Reason AI")}
            onClick={props.onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>
      {props.showHistory ? (
        <div
          id="ai-conversation-history"
          className="min-h-0 flex-1 overflow-y-auto p-2"
          aria-label={t("Conversations")}
        >
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
      ) : (
        <>
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
          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {props.messages.length === 0 && !props.busy ? (
              <p className="mx-auto max-w-64 pt-12 text-center text-sm text-muted-foreground">
                {t(
                  "Use sources from your workspace to answer questions, summarize, and continue your writing."
                )}
              </p>
            ) : null}
            {props.messages.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                onOpenCitation={props.onOpenCitation}
              />
            ))}
            {props.streamedText ? (
              <MessageView
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: props.streamedText,
                  created_at: "",
                }}
                onOpenCitation={props.onOpenCitation}
              />
            ) : null}
            {props.tools.map((tool, index) => (
              <p
                key={`${tool}-${index}`}
                className="text-xs text-muted-foreground"
              >
                {t("Running {tool}...", { tool })}
              </p>
            ))}
            {props.busy && !props.streamedText ? (
              <p className="text-sm text-muted-foreground">
                {t("Thinking...")}
              </p>
            ) : null}
            {props.error ? (
              <p role="alert" className="text-sm text-destructive">
                {props.error}
              </p>
            ) : null}
            {props.status ? (
              <p role="status" className="text-xs text-muted-foreground">
                {props.status}
              </p>
            ) : null}
          </div>
          <div className="relative border-t p-3">
            {mention ? (
              <Command
                label={t("Mention page")}
                className="absolute right-3 bottom-full left-3 mb-2 h-auto border shadow-md"
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
            <Textarea
              ref={textareaRef}
              value={props.draft}
              onChange={(event) => {
                props.onDraftChange(event.target.value)
                setCursor(event.target.selectionStart)
              }}
              onClick={(event) => setCursor(event.currentTarget.selectionStart)}
              onSelect={(event) =>
                setCursor(event.currentTarget.selectionStart)
              }
              onKeyDown={(event) => {
                if (mention && matchingPages.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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
                      matchingPages[activeMentionIndex % matchingPages.length]
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
              className="max-h-32 min-h-20 resize-none"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {t("Enter sends · Shift+Enter inserts a line break")}
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
                  size="sm"
                  disabled={!props.draft.trim()}
                  onClick={props.onSubmit}
                >
                  <SendIcon /> {t("Send")}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
