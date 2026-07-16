import type { AiRunEvent } from "./contracts"

export class SseParser {
  private buffer = ""

  push(chunk: string, flush = false): AiRunEvent[] {
    this.buffer += chunk
    const frames: string[] = []
    const delimiter = /(?:\r\n|(?<!\r)\n|\r(?!\n))(?:\r\n|(?<!\r)\n|\r(?!\n))/
    for (;;) {
      // A trailing CR may be the first half of CRLF in the next chunk. Do not
      // consume it as a standalone line ending until another byte arrives.
      const searchable =
        !flush && this.buffer.endsWith("\r")
          ? this.buffer.slice(0, -1)
          : this.buffer
      const match = delimiter.exec(searchable)
      if (!match || match.index === undefined) break
      frames.push(this.buffer.slice(0, match.index))
      this.buffer = this.buffer.slice(match.index + match[0].length)
    }
    if (flush && this.buffer) frames.push(this.buffer)
    if (flush) this.buffer = ""

    return frames.flatMap((frame) => {
      let eventName = "message"
      const data: string[] = []
      for (const line of frame.split(/\r\n|\r|\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim()
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
      }
      if (data.length === 0) return []
      try {
        const payload = JSON.parse(data.join("\n")) as Record<string, unknown>
        const type = String(payload.type ?? eventName)
        if (type === "run") {
          return [{ type: "run_started", run_id: String(payload.run_id) }]
        }
        if (type === "text") {
          return [{ type: "text_delta", delta: String(payload.text ?? "") }]
        }
        if (type === "tool") {
          return [
            { type: "tool_started", tool: String(payload.name ?? "tool") },
          ]
        }
        if (type === "completion") {
          return [
            {
              ...payload,
              type: "run_completed",
              run_id: String(payload.run_id),
            } as Extract<AiRunEvent, { type: "run_completed" }>,
          ]
        }
        if (type === "error") {
          return [
            {
              ...payload,
              type: "run_failed",
              message: String(payload.message ?? "AI run failed"),
              run_id:
                typeof payload.run_id === "string" ? payload.run_id : undefined,
            } as Extract<AiRunEvent, { type: "run_failed" }>,
          ]
        }
        if (type === "usage" && "prompt_tokens" in payload) {
          return [
            {
              type: "usage",
              input_tokens: Number(payload.prompt_tokens),
              output_tokens: Number(payload.completion_tokens),
            },
          ]
        }
        return [{ ...payload, type } as AiRunEvent]
      } catch {
        return []
      }
    })
  }
}

export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AiRunEvent) => void
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      onEvent(event)
    }
  }
  for (const event of parser.push(decoder.decode(), true)) onEvent(event)
}
