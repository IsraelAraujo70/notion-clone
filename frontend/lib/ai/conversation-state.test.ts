import { describe, expect, it } from "vitest"

import {
  appendAssistantDelta,
  reconcilePersistedMessage,
  replaceConversationMessages,
  sortConversations,
} from "./conversation-state"

describe("conversation state", () => {
  it("sorts persisted conversations by most recent activity", () => {
    const base = { workspace_id: "w", title: "", created_at: "2026-01-01" }
    expect(
      sortConversations([
        { ...base, id: "old", updated_at: "2026-01-01" },
        { ...base, id: "new", updated_at: "2026-02-01" },
      ]).map((conversation) => conversation.id)
    ).toEqual(["new", "old"])
  })

  it("does not replace a newly selected conversation with a stale history response", () => {
    const messages = [
      {
        id: "m1",
        role: "user" as const,
        content: "old",
        created_at: "now",
      },
    ]
    expect(replaceConversationMessages("new", "old", messages)).toBeNull()
    expect(replaceConversationMessages("old", "old", messages)).toBe(messages)
  })

  it("accumulates streaming text in delivery order", () => {
    expect(appendAssistantDelta(appendAssistantDelta("", "A"), "B")).toBe("AB")
  })

  it("reconciles the final persisted message including citations", () => {
    const persisted = {
      id: "assistant-1",
      role: "assistant" as const,
      content: "Final answer",
      citations: [
        {
          workspace_id: "w",
          page_id: "p",
          page_title: "Page",
          block_id: "b",
          snippet: "Source",
        },
      ],
      created_at: "now",
    }
    expect(
      reconcilePersistedMessage(
        [
          {
            id: "user-1",
            role: "user",
            content: "Question",
            created_at: "before",
          },
        ],
        persisted
      )
    ).toEqual([
      {
        id: "user-1",
        role: "user",
        content: "Question",
        created_at: "before",
      },
      persisted,
    ])
  })
})
