import type { AiConversation, AiMessage } from "@reason/core/ai/contracts"

export function activeConversationStorageKey(workspaceId: string) {
  return `reason:ai-active-conversation:${workspaceId}`
}

export function conversationActivityStorageKey(
  workspaceId: string,
  conversationId: string
) {
  return `reason:ai-conversation-activity:${workspaceId}:${conversationId}`
}

export function sortConversations(conversations: AiConversation[]) {
  return [...conversations].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  )
}

export function replaceConversationMessages(
  currentConversationId: string | null,
  loadedConversationId: string,
  messages: AiMessage[]
) {
  return currentConversationId === loadedConversationId ? messages : null
}

export function appendAssistantDelta(current: string, delta: string) {
  return current + delta
}

export function reconcilePersistedMessage(
  messages: AiMessage[],
  persisted: AiMessage
) {
  const index = messages.findIndex((message) => message.id === persisted.id)
  if (index === -1) return [...messages, persisted]
  return messages.map((message, currentIndex) =>
    currentIndex === index ? persisted : message
  )
}
