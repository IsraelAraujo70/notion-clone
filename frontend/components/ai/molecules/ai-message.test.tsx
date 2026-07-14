import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AiMessage } from "./ai-message"

const message = {
  id: "message-1",
  role: "assistant" as const,
  content: "",
  created_at: "2026-07-14T00:00:00Z",
}

describe("AiMessage", () => {
  it("renders assistant GFM and secure external links", () => {
    render(
      <AiMessage
        message={{
          ...message,
          content:
            "**Resposta:** 43\n\n- pista final\n\n[fonte](https://example.com)\n\n| A | B |\n| - | - |\n| X | 43 |",
        }}
        onOpenCitation={vi.fn()}
      />
    )

    expect(screen.getByText("Resposta:").tagName).toBe("STRONG")
    expect(screen.getByRole("list")).toHaveTextContent("pista final")
    expect(screen.getByRole("table")).toHaveTextContent("43")
    expect(screen.getByRole("link", { name: "fonte" })).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    })
  })

  it("keeps raw HTML inert and user markdown literal", () => {
    const { rerender } = render(
      <AiMessage
        message={{
          ...message,
          content: '<img src=x onerror="alert(1)"> **seguro**',
        }}
        onOpenCitation={vi.fn()}
      />
    )

    expect(document.querySelector("img")).not.toBeInTheDocument()
    expect(screen.getByText("seguro").tagName).toBe("STRONG")

    rerender(
      <AiMessage
        message={{ ...message, role: "user", content: "**texto literal**" }}
        onOpenCitation={vi.fn()}
      />
    )
    expect(screen.getByText("**texto literal**").tagName).toBe("P")
  })

  it("does not expose dangerous link protocols", () => {
    render(
      <AiMessage
        message={{ ...message, content: "[não clique](javascript:alert(1))" }}
        onOpenCitation={vi.fn()}
      />
    )

    expect(screen.getByText("não clique").closest("a")).toBeNull()
  })
})
