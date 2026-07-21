import {
  AlertCircleIcon,
  ArrowDownIcon,
  InfoIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { Fragment } from "react"

import { AiMessage as MessageView } from "../molecules/ai-message"
import { AiToolActivity } from "../molecules/ai-tool-activity"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import type { AiCitation, AiMessage } from "@reason/core/ai/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import type {
  AiCompletedActivity,
  AiOperationApproval as Approval,
  AiToolActivity as ToolActivity,
} from "./use-ai-assistant-controller"

type Props = {
  isPage: boolean
  messages: AiMessage[]
  activities: AiCompletedActivity[]
  streamedText: string
  tools: ToolActivity[]
  approvals: Approval[]
  busy: boolean
  error: string | null
  status: string | null
  bottomInset: number
  onOpenCitation: (citation: AiCitation) => void
  onApprovalDecision: (
    proposalId: string,
    approved: boolean,
    allowConversation?: boolean
  ) => void
}

export function AiConversationTimeline(props: Props) {
  const { t } = useI18n()
  const lastMessage = props.messages.at(-1)
  const completedAssistant =
    (props.tools.length > 0 || props.approvals.length > 0) &&
    !props.busy &&
    !props.streamedText &&
    lastMessage?.role === "assistant"
      ? lastMessage
      : null
  const messages = completedAssistant
    ? props.messages.slice(0, -1)
    : props.messages
  const messageIds = new Set(messages.map((message) => message.id))

  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollPreviousItemPeek={48}
    >
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label={t("Conversation messages")}>
          <MessageScrollerContent
            aria-busy={props.busy}
            style={{ paddingBottom: props.bottomInset + 24 }}
            className={cn(
              "gap-5 px-4 py-5",
              props.isPage && "mx-auto w-full max-w-2xl py-7"
            )}
          >
            {messages.length === 0 && !props.busy ? (
              <MessageScrollerItem>
                <p className="mx-auto max-w-64 pt-12 text-center text-sm text-muted-foreground">
                  {t(
                    "Use sources from your workspace to answer questions, summarize, and continue your writing."
                  )}
                </p>
              </MessageScrollerItem>
            ) : null}
            {messages.map((message) => (
              <Fragment key={message.id}>
                {props.activities
                  .filter(
                    (activity) => activity.assistantMessageId === message.id
                  )
                  .map((activity) => (
                    <MessageScrollerItem
                      key={activity.id}
                      messageId={`activity:${activity.id}`}
                    >
                      <AiToolActivity
                        tools={activity.tools}
                        approvals={activity.approvals}
                      />
                    </MessageScrollerItem>
                  ))}
                <MessageScrollerItem
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <MessageView
                    message={message}
                    onOpenCitation={props.onOpenCitation}
                  />
                </MessageScrollerItem>
              </Fragment>
            ))}
            {props.activities
              .filter(
                (activity) =>
                  !activity.assistantMessageId ||
                  !messageIds.has(activity.assistantMessageId)
              )
              .map((activity) => (
                <MessageScrollerItem
                  key={activity.id}
                  messageId={`activity:${activity.id}`}
                >
                  <AiToolActivity
                    tools={activity.tools}
                    approvals={activity.approvals}
                  />
                </MessageScrollerItem>
              ))}
            {props.tools.length > 0 || props.approvals.length > 0 ? (
              <MessageScrollerItem
                messageId={`activity:${
                  props.tools[0]?.id ?? props.approvals[0]?.proposalId
                }`}
              >
                <AiToolActivity
                  key={
                    props.tools.some((tool) => tool.status === "running")
                      ? "running"
                      : "completed"
                  }
                  tools={props.tools}
                  approvals={props.approvals}
                />
              </MessageScrollerItem>
            ) : null}
            {props.busy &&
            !props.streamedText &&
            props.tools.length === 0 &&
            !props.status ? (
              <MessageScrollerItem messageId="ai-thinking">
                <Marker role="status">
                  <MarkerIcon>
                    <LoaderCircleIcon className="animate-spin" />
                  </MarkerIcon>
                  <MarkerContent className="shimmer">
                    {t("Thinking...")}
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
            {props.streamedText ? (
              <MessageScrollerItem messageId="ai-streaming">
                <MessageView
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: props.streamedText,
                    created_at: "",
                  }}
                  onOpenCitation={props.onOpenCitation}
                />
              </MessageScrollerItem>
            ) : null}
            {completedAssistant ? (
              <MessageScrollerItem messageId={completedAssistant.id}>
                <MessageView
                  message={completedAssistant}
                  onOpenCitation={props.onOpenCitation}
                />
              </MessageScrollerItem>
            ) : null}
            {props.error ? (
              <MessageScrollerItem>
                <Marker role="alert" className="text-destructive">
                  <MarkerIcon>
                    <AlertCircleIcon />
                  </MarkerIcon>
                  <MarkerContent>{props.error}</MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
            {props.status ? (
              <MessageScrollerItem>
                <Marker role="status">
                  <MarkerIcon>
                    <InfoIcon />
                  </MarkerIcon>
                  <MarkerContent>{props.status}</MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton style={{ bottom: props.bottomInset + 12 }}>
          <ArrowDownIcon />
          <span className="sr-only">{t("Scroll to latest")}</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
