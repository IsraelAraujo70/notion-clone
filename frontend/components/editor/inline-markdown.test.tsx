import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { InlineMarkdown } from "./inline-markdown"
import {
  hasInlineMarkdown,
  parseInlineMarkdown,
} from "@reason/core/inline-markdown"

describe("parseInlineMarkdown", () => {
  it("parses mixed and combined marks in one line", () => {
    const segments = parseInlineMarkdown(
      "normal **forte** *itálico* ~riscado~ `const x = *` ***ambos***"
    )

    expect(segments).toEqual([
      { text: "normal ", marks: [] },
      { text: "forte", marks: ["bold"] },
      { text: " ", marks: [] },
      { text: "itálico", marks: ["italic"] },
      { text: " ", marks: [] },
      { text: "riscado", marks: ["strike"] },
      { text: " ", marks: [] },
      { text: "const x = *", marks: ["code"] },
      { text: " ", marks: [] },
      { text: "ambos", marks: ["bold", "italic"] },
    ])
    expect(hasInlineMarkdown(segments)).toBe(true)
  })

  it("keeps malformed markers literal and honors escapes", () => {
    expect(parseInlineMarkdown("**aberto e `código")).toEqual([
      { text: "**aberto e `código", marks: [] },
    ])
    expect(
      parseInlineMarkdown("\\**literal\\** \\~til\\~ \\`crase\\`")
    ).toEqual([{ text: "**literal** ~til~ `crase`", marks: [] }])
    expect(
      parseInlineMarkdown("```bloco``` <script>alert(1)</script>")
    ).toEqual([{ text: "```bloco``` <script>alert(1)</script>", marks: [] }])
  })

  it("preserves unicode and handles large plain text as one segment", () => {
    const source = `ação 👩🏽‍💻 ${"x".repeat(100_000)}`
    expect(parseInlineMarkdown(source)).toEqual([{ text: source, marks: [] }])
  })
})

describe("InlineMarkdown", () => {
  it("renders typed elements without interpreting HTML", () => {
    const { container } = render(
      <InlineMarkdown
        segments={parseInlineMarkdown("**forte** `código` <img src=x>")}
      />
    )

    expect(screen.getByText("forte").tagName).toBe("STRONG")
    expect(screen.getByText("código").tagName).toBe("CODE")
    expect(screen.getByText("<img src=x>")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })
})
