import { describe, expect, it } from "vitest"

import { SseParser } from "./sse"

describe("SseParser", () => {
  it("parses fragmented named events and multiline data", () => {
    const parser = new SseParser()
    expect(parser.push('event: text_delta\ndata: {"delta":"Hel')).toEqual([])
    expect(
      parser.push(
        'lo"}\n\nevent: tool_started\ndata: {"tool":"search",\ndata: "label":"Searching"}\n\n'
      )
    ).toEqual([
      { type: "text_delta", delta: "Hello" },
      { type: "tool_started", tool: "search", label: "Searching" },
    ])
  })

  it("uses a payload type and flushes a final frame without a blank line", () => {
    const parser = new SseParser()
    expect(
      parser.push('data: {"type":"run_completed","run_id":"run-1"}', true)
    ).toEqual([{ type: "run_completed", run_id: "run-1" }])
  })

  it("normalizes the concrete backend event names at the transport boundary", () => {
    const parser = new SseParser()
    expect(
      parser.push(
        'event: run\ndata: {"type":"run","run_id":"run-1"}\n\n' +
          'event: text\ndata: {"type":"text","text":"Answer"}\n\n' +
          'event: completion\ndata: {"type":"completion","run_id":"run-1"}\n\n'
      )
    ).toEqual([
      { type: "run_started", run_id: "run-1" },
      { type: "text_delta", delta: "Answer" },
      { type: "run_completed", run_id: "run-1" },
    ])
  })

  it("preserves terminal metadata from backend error events", () => {
    const parser = new SseParser()
    expect(
      parser.push(
        'event: error\ndata: {"type":"error","run_id":"run-1","message":"partial failure","group_id":"group-1","last_seq":12}\n\n'
      )
    ).toEqual([
      {
        type: "run_failed",
        run_id: "run-1",
        message: "partial failure",
        group_id: "group-1",
        last_seq: 12,
      },
    ])
  })

  it("ignores malformed events without losing the next event", () => {
    const parser = new SseParser()
    expect(
      parser.push('data: nope\n\nevent: text_delta\ndata: {"delta":"ok"}\n\n')
    ).toEqual([{ type: "text_delta", delta: "ok" }])
  })

  it("parses CRLF delimiters split exactly across chunk boundaries", () => {
    const parser = new SseParser()
    expect(
      parser.push('event: text\r\ndata: {"type":"text","text":"one"}\r')
    ).toEqual([])
    expect(
      parser.push(
        '\n\r\nevent: completion\r\ndata: {"type":"completion","run_id":"run-1","group_id":"group-1","last_seq":8}\r'
      )
    ).toEqual([{ type: "text_delta", delta: "one" }])
    expect(parser.push("\n\r\n")).toEqual([
      {
        type: "run_completed",
        run_id: "run-1",
        group_id: "group-1",
        last_seq: 8,
      },
    ])
  })

  it("does not consume the first byte of a split CRLF blank line", () => {
    const parser = new SseParser()
    expect(
      parser.push('event: text\r\ndata: {"type":"text","text":"one"}\r\n\r')
    ).toEqual([])
    expect(parser.push("\n")).toEqual([{ type: "text_delta", delta: "one" }])
  })
})
