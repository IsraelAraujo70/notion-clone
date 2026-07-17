import type { BlockProperties, BlockType } from "@reason/core/contracts"

export interface MarkdownShortcut {
  blockType: BlockType
  text: string
  caretOffset: number
  replacesBlock?: boolean
}

export interface MarkdownBlockDraft {
  blockType: BlockType
  properties: BlockProperties
}

export const MAX_MARKDOWN_PASTE_CHARS = 100_000
export const MAX_MARKDOWN_PASTE_BLOCKS = 200

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
}

const CODE_LANGUAGES = new Set([
  "plaintext",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "html",
  "css",
  "json",
  "markdown",
  "bash",
  "sql",
  "python",
  "rust",
  "go",
  "java",
  "csharp",
  "cpp",
])

function codeLanguage(value: string) {
  const normalized = value.toLowerCase()
  const language = CODE_LANGUAGE_ALIASES[normalized] ?? normalized
  return CODE_LANGUAGES.has(language) ? language : "plaintext"
}

export function isStructuredMarkdownPaste(text: string) {
  return (
    /[\r\n\u0085\u2028\u2029]/.test(text) ||
    /^[ \t]*(?:#{1,3}\s|[-*+]\s|\d+[.)]\s|(?:[-*+]\s+)?\[[ xX]\]\s|>\s?|```|---\s*$)/.test(
      text
    )
  )
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlockDraft[] {
  const lines = markdown
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, "\n")
    .split("\n")
  const blocks: MarkdownBlockDraft[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({
      blockType: "paragraph",
      properties: { text: paragraph.join("\n") },
    })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = /^[ \t]*```([A-Za-z0-9_+#-]*)\s*$/.exec(line)
    if (fence) {
      flushParagraph()
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^[ \t]*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      const language = fence[1].toLowerCase()
      blocks.push(
        language === "mermaid"
          ? { blockType: "mermaid", properties: { text: code.join("\n") } }
          : {
              blockType: "code",
              properties: {
                text: code.join("\n"),
                language: codeLanguage(language || "plaintext"),
              },
            }
      )
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      continue
    }
    if (/^[ \t]*---\s*$/.test(line)) {
      flushParagraph()
      blocks.push({ blockType: "divider", properties: {} })
      continue
    }
    const heading = /^[ \t]*(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({
        blockType: `heading${heading[1].length}` as BlockType,
        properties: { text: heading[2] },
      })
      continue
    }
    const todo = /^[ \t]*(?:[-*+]\s+)?\[([ xX])\]\s+(.*)$/.exec(line)
    if (todo) {
      flushParagraph()
      blocks.push({
        blockType: "to_do",
        properties: { text: todo[2], checked: todo[1].toLowerCase() === "x" },
      })
      continue
    }
    const bullet = /^[ \t]*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      blocks.push({
        blockType: "bulleted_list_item",
        properties: { text: bullet[1] },
      })
      continue
    }
    const numbered = /^[ \t]*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      flushParagraph()
      blocks.push({
        blockType: "numbered_list_item",
        properties: { text: numbered[1] },
      })
      continue
    }
    const quote = /^[ \t]*>\s?(.*)$/.exec(line)
    if (quote) {
      flushParagraph()
      blocks.push({ blockType: "quote", properties: { text: quote[1] } })
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()
  return blocks
}

const SPACE_PREFIXES: Array<[prefix: string, blockType: BlockType]> = [
  ["### ", "heading3"],
  ["## ", "heading2"],
  ["# ", "heading1"],
  ["- ", "bulleted_list_item"],
  ["* ", "bulleted_list_item"],
  ["1. ", "numbered_list_item"],
  ["[ ] ", "to_do"],
  ["[] ", "to_do"],
  ["> ", "quote"],
]

export function detectMarkdownShortcut(
  text: string,
  caretOffset: number
): MarkdownShortcut | null {
  for (const [prefix, blockType] of SPACE_PREFIXES) {
    const marker = prefix.slice(0, -1)
    const separator = text[marker.length]
    if (
      caretOffset === prefix.length &&
      text.startsWith(marker) &&
      (separator === " " || separator === "\u00a0")
    ) {
      return {
        blockType,
        text: text.slice(prefix.length),
        caretOffset: caretOffset - prefix.length,
      }
    }
  }

  if (caretOffset === 3 && text === "```")
    return { blockType: "code", text: "", caretOffset: 0 }
  if (caretOffset === 3 && text === "---")
    return {
      blockType: "divider",
      text: "",
      caretOffset: 0,
      replacesBlock: true,
    }

  return null
}

export function slashQuery(text: string, caretOffset: number): string | null {
  const beforeCaret = text.slice(0, caretOffset)
  const slashIndex = beforeCaret.lastIndexOf("/")
  if (slashIndex === -1) return null
  const query = beforeCaret.slice(slashIndex + 1)
  if (/\s/.test(query)) return null
  return query
}

export function removeSlashQuery(
  text: string,
  caretOffset: number
): { text: string; slashIndex: number } | null {
  const beforeCaret = text.slice(0, caretOffset)
  const slashIndex = beforeCaret.lastIndexOf("/")
  if (slashIndex === -1) return null
  const query = beforeCaret.slice(slashIndex + 1)
  if (/\s/.test(query)) return null
  return {
    text: text.slice(0, slashIndex) + text.slice(caretOffset),
    slashIndex,
  }
}
