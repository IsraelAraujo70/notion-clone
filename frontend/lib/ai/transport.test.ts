import { afterEach, describe, expect, it, vi } from "vitest"

import { API_BASE_URL } from "@/lib/api"
import { aiTransport } from "./transport"

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("aiTransport", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("loads persisted conversation messages through the centralized boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json([
            {
              id: "conversation-1",
              workspace_id: "workspace-1",
              title: "Question",
              created_at: "now",
              updated_at: "now",
            },
          ])
        )
        .mockResolvedValueOnce(
          json([
            {
              id: "message-1",
              role: "assistant",
              content: "Answer",
              citations: ["legacy-block-id"],
              created_at: "now",
            },
          ])
        )
    )

    const history = await aiTransport.getConversation(
      "token",
      "workspace-1",
      "conversation-1"
    )
    expect(history.messages[0].citations).toEqual([])
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE_URL}/workspaces/workspace-1/ai/conversations/conversation-1/messages`,
      expect.anything()
    )
  })

  it("maps actions to the backend and resolves the committed operation group", async () => {
    const stream = [
      'event: run\ndata: {"type":"run","run_id":"run-1"}\n\n',
      'event: text\ndata: {"type":"text","text":"Done"}\n\n',
      'event: completion\ndata: {"type":"completion","run_id":"run-1","last_seq":42,"message":{"id":"message-1","role":"assistant","content":"Done","citations":[{"workspace_id":"workspace-1","page_id":"page-1","page_title":"Page","block_id":"block-1","snippet":"Source"}],"created_at":"now"}}\n\n',
    ].join("")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        )
        .mockResolvedValueOnce(
          json({
            id: "run-1",
            workspace_id: "workspace-1",
            conversation_id: "conversation-1",
            action: "transform_selection",
            status: "completed",
            model: "test",
            operation_group_id: "group-1",
            error: null,
            last_seq: 42,
            created_at: "now",
            completed_at: "now",
          })
        )
    )
    const events: unknown[] = []

    await aiTransport.streamMessage(
      "token",
      "workspace-1",
      "conversation-1",
      {
        prompt: "Improve",
        action: {
          type: "transform_selection",
          block_ids: ["block-2", "block-1"],
          instruction: "Improve",
        },
      },
      (event) => events.push(event)
    )

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/workspaces/workspace-1/ai/actions/transform_selection`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversationId: "conversation-1",
          selection: ["block-2", "block-1"],
          prompt: "Improve",
        }),
      })
    )
    expect(events).toEqual([
      { type: "run_started", run_id: "run-1" },
      { type: "text_delta", delta: "Done" },
      {
        type: "run_completed",
        run_id: "run-1",
        group_id: "group-1",
        last_seq: 42,
        message: {
          id: "message-1",
          role: "assistant",
          content: "Done",
          citations: [
            {
              workspace_id: "workspace-1",
              page_id: "page-1",
              page_title: "Page",
              block_id: "block-1",
              snippet: "Source",
            },
          ],
          created_at: "now",
        },
      },
    ])
  })

  it("sends current page and selection context for workspace questions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            'event: completion\ndata: {"type":"completion","run_id":"run-2"}\n\n',
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          json({
            id: "run-2",
            workspace_id: "workspace-1",
            conversation_id: "conversation-1",
            action: "workspace_agent",
            status: "completed",
            model: "test",
            operation_group_id: null,
            error: null,
            last_seq: null,
            created_at: "now",
            completed_at: "now",
          })
        )
    )

    await aiTransport.streamMessage(
      "token",
      "workspace-1",
      "conversation-1",
      {
        prompt: "What is this about?",
        action: {
          type: "workspace_agent",
          prompt: "What is this about?",
          page_id: "page-1",
          mentioned_page_ids: ["page-2"],
          selection: ["selected-1", "anchor-1"],
          anchor_block_id: "anchor-1",
        },
      },
      () => {}
    )

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE_URL}/workspaces/workspace-1/ai/actions/workspace_agent`,
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: "conversation-1",
          pageId: "page-1",
          selection: ["anchor-1", "selected-1"],
          mentionedPageIds: ["page-2"],
          prompt: "What is this about?",
        }),
      })
    )
  })

  it("resolves failed-run group metadata from the backend status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            'event: run\ndata: {"type":"run","run_id":"run-failed"}\n\n' +
              'event: error\ndata: {"type":"error","message":"provider failed"}\n\n',
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          json({
            id: "run-failed",
            workspace_id: "workspace-1",
            conversation_id: "conversation-1",
            action: "continue_writing",
            status: "failed",
            model: "test",
            operation_group_id: "group-partial",
            error: "provider failed",
            last_seq: 18,
            created_at: "now",
            completed_at: "now",
          })
        )
    )
    const events: unknown[] = []

    await aiTransport.streamMessage(
      "token",
      "workspace-1",
      "conversation-1",
      {
        prompt: "Continue",
        action: { type: "continue_writing", anchor_block_id: "block-1" },
      },
      (event) => events.push(event)
    )

    expect(events.at(-1)).toEqual({
      type: "run_failed",
      run_id: "run-failed",
      message: "provider failed",
      group_id: "group-partial",
      last_seq: 18,
    })
  })

  it("polls a known run with a fixed attempt bound until it is terminal", async () => {
    const running = {
      id: "run-1",
      workspace_id: "workspace-1",
      conversation_id: null,
      action: "summarize_page",
      status: "running",
      model: "test",
      operation_group_id: null,
      error: null,
      last_seq: null,
      created_at: "now",
      completed_at: null,
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(running))
        .mockResolvedValueOnce(
          json({
            ...running,
            status: "completed",
            operation_group_id: "group-1",
            last_seq: 9,
            completed_at: "later",
          })
        )
    )

    const run = await aiTransport.waitForRun(
      "token",
      "workspace-1",
      "run-1",
      undefined,
      { attempts: 2, intervalMs: 0 }
    )

    expect(run.status).toBe("completed")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
