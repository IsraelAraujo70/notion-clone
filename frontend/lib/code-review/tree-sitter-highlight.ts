"use client"

import { useCallback, useEffect, useState } from "react"
import type { Language, Node as SyntaxNode } from "web-tree-sitter"

import type { ReviewLineAddress } from "./contracts"
import type {
  ParsedPatch,
  ParsedPatchHunk,
  ParsedPatchLine,
} from "./parse-unified-patch"

export type SyntaxTokenKind =
  | "comment"
  | "constant"
  | "function"
  | "keyword"
  | "number"
  | "operator"
  | "property"
  | "string"
  | "type"
  | "variable"

export type SyntaxToken = {
  start: number
  end: number
  kind: SyntaxTokenKind
}

type Grammar =
  | "bash"
  | "c"
  | "c_sharp"
  | "cpp"
  | "css"
  | "go"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "php"
  | "python"
  | "ruby"
  | "rust"
  | "toml"
  | "tsx"
  | "typescript"
  | "yaml"

type SourceLine = {
  hunkId: string
  line: number
  content: string
}

const GRAMMAR_BY_EXTENSION: Record<string, Grammar> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "c_sharp",
  css: "css",
  cxx: "cpp",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  mjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
}

const SPECIAL_FILES: Record<string, Grammar> = {
  Dockerfile: "bash",
  Makefile: "bash",
  Rakefile: "ruby",
}

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "fn",
  "for",
  "from",
  "func",
  "function",
  "if",
  "impl",
  "import",
  "in",
  "interface",
  "let",
  "match",
  "mod",
  "new",
  "package",
  "private",
  "protected",
  "pub",
  "public",
  "return",
  "static",
  "struct",
  "switch",
  "throw",
  "trait",
  "try",
  "type",
  "typeof",
  "use",
  "var",
  "while",
  "with",
  "yield",
])

const CONSTANTS = new Set(["false", "nil", "null", "none", "true"])
const OPERATORS = /^[+\-*/%=&|!<>?:~^]+$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()

let runtimePromise: Promise<typeof import("web-tree-sitter")> | null = null
const languagePromises = new Map<Grammar, Promise<Language>>()

export function grammarFromPath(path: string): Grammar | null {
  const filename = path.split("/").at(-1) ?? path
  if (SPECIAL_FILES[filename]) return SPECIAL_FILES[filename]
  const extension = filename.includes(".")
    ? filename.split(".").at(-1)?.toLowerCase()
    : undefined
  return extension ? (GRAMMAR_BY_EXTENSION[extension] ?? null) : null
}

export function useTreeSitterHighlight(path: string, patch: ParsedPatch) {
  const [result, setResult] = useState<{
    path: string
    patch: ParsedPatch
    tokens: Map<string, SyntaxToken[]>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void highlightPatch(path, patch)
      .then((next) => {
        if (!cancelled) setResult({ path, patch, tokens: next })
      })
      .catch(() => {
        if (!cancelled) setResult({ path, patch, tokens: new Map() })
      })

    return () => {
      cancelled = true
    }
  }, [patch, path])

  const tokens =
    result?.path === path && result.patch === patch ? result.tokens : null

  return useCallback(
    (address: ReviewLineAddress | null, content: string) => {
      const highlighted = address
        ? tokens?.get(highlightKey(address.hunkId, address.side, address.line))
        : undefined
      return highlighted ?? fallbackTokens(path, content)
    },
    [path, tokens]
  )
}

export function highlightKey(
  hunkId: string,
  side: "LEFT" | "RIGHT",
  line: number
) {
  return `${hunkId}:${side}:${line}`
}

async function highlightPatch(path: string, patch: ParsedPatch) {
  const output = new Map<string, SyntaxToken[]>()
  const grammar = grammarFromPath(path)
  if (!grammar || patch.kind !== "text") return output

  const [{ Parser }, language] = await Promise.all([
    loadRuntime(),
    loadLanguage(grammar),
  ])
  const parser = new Parser()
  parser.setLanguage(language)

  try {
    for (const hunk of patch.hunks) {
      collectSide(parser, output, hunk, "LEFT")
      collectSide(parser, output, hunk, "RIGHT")
    }
  } finally {
    parser.delete()
  }

  return output
}

function collectSide(
  parser: InstanceType<typeof import("web-tree-sitter").Parser>,
  output: Map<string, SyntaxToken[]>,
  hunk: ParsedPatchHunk,
  side: "LEFT" | "RIGHT"
) {
  const lines = sourceLines(hunk, side)
  if (lines.length === 0) return
  const source = lines.map((line) => line.content).join("\n")
  const tree = parser.parse(source)
  if (!tree) return

  try {
    visitNode(tree.rootNode, lines, hunk.id, side, output)
    for (const line of lines) {
      const key = highlightKey(hunk.id, side, line.line)
      const current = output.get(key)
      if (current)
        output.set(key, normalizeTokens(current, line.content.length))
    }
  } finally {
    tree.delete()
  }
}

function sourceLines(
  hunk: ParsedPatchHunk,
  side: "LEFT" | "RIGHT"
): SourceLine[] {
  return hunk.lines.flatMap((line: ParsedPatchLine) => {
    const number = side === "LEFT" ? line.oldLine : line.newLine
    if (number === null) return []
    return [{ hunkId: hunk.id, line: number, content: line.content }]
  })
}

function visitNode(
  node: SyntaxNode,
  lines: SourceLine[],
  hunkId: string,
  side: "LEFT" | "RIGHT",
  output: Map<string, SyntaxToken[]>
) {
  const kind = syntaxKind(node)
  if (kind === "comment" || kind === "string") {
    addNodeTokens(node, kind, lines, hunkId, side, output)
    return
  }

  const children = node.children.filter(
    (child): child is SyntaxNode => child !== null
  )
  if (children.length === 0) {
    if (kind) addNodeTokens(node, kind, lines, hunkId, side, output)
    return
  }

  children.forEach((child) => visitNode(child, lines, hunkId, side, output))
}

function syntaxKind(node: SyntaxNode): SyntaxTokenKind | null {
  const type = node.type.toLowerCase()
  const text = node.text.toLowerCase()
  const parent = node.parent?.type.toLowerCase() ?? ""

  if (type.includes("comment")) return "comment"
  if (
    type.includes("string") ||
    type.includes("template") ||
    type.includes("heredoc") ||
    type.includes("char_literal")
  )
    return "string"
  if (/number|integer|float|decimal/.test(type)) return "number"
  if (CONSTANTS.has(text) || type.includes("boolean")) return "constant"
  if (KEYWORDS.has(text)) return "keyword"
  if (OPERATORS.test(node.text)) return "operator"
  if (/type_identifier|primitive_type|builtin_type/.test(type)) return "type"
  if (/property_identifier|field_identifier|attribute_name/.test(type))
    return "property"
  if (/function|method/.test(type) && node.childCount === 0) return "function"
  if (type.includes("identifier")) {
    if (/call|function|method/.test(parent)) return "function"
    if (/type|class|interface|trait|struct/.test(parent)) return "type"
    if (/member|field|property|pair/.test(parent)) return "property"
    return "variable"
  }
  return null
}

function addNodeTokens(
  node: SyntaxNode,
  kind: SyntaxTokenKind,
  lines: SourceLine[],
  hunkId: string,
  side: "LEFT" | "RIGHT",
  output: Map<string, SyntaxToken[]>
) {
  const endRow = Math.min(node.endPosition.row, lines.length - 1)
  for (let row = node.startPosition.row; row <= endRow; row += 1) {
    const sourceLine = lines[row]
    if (!sourceLine) continue
    const start =
      row === node.startPosition.row
        ? byteColumnToStringIndex(sourceLine.content, node.startPosition.column)
        : 0
    const end =
      row === node.endPosition.row
        ? byteColumnToStringIndex(sourceLine.content, node.endPosition.column)
        : sourceLine.content.length
    if (end <= start) continue
    const key = highlightKey(hunkId, side, sourceLine.line)
    const current = output.get(key) ?? []
    current.push({ start, end, kind })
    output.set(key, current)
  }
}

function normalizeTokens(tokens: SyntaxToken[], length: number) {
  return tokens
    .map((token) => ({
      ...token,
      start: Math.max(0, Math.min(token.start, length)),
      end: Math.max(0, Math.min(token.end, length)),
    }))
    .filter((token) => token.end > token.start)
    .toSorted((left, right) => left.start - right.start || left.end - right.end)
}

function byteColumnToStringIndex(text: string, column: number) {
  return decoder.decode(encoder.encode(text).slice(0, column)).length
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("web-tree-sitter").then(async (treeSitter) => {
      await treeSitter.Parser.init({
        locateFile: () => "/tree-sitter/web-tree-sitter.wasm",
      })
      return treeSitter
    })
  }
  return runtimePromise
}

function loadLanguage(grammar: Grammar) {
  let promise = languagePromises.get(grammar)
  if (!promise) {
    promise = loadRuntime().then(({ Language }) =>
      Language.load(`/tree-sitter/tree-sitter-${grammar}.wasm`)
    )
    languagePromises.set(grammar, promise)
  }
  return promise
}

function fallbackTokens(path: string, content: string): SyntaxToken[] {
  if (/\.(?:md|mdx)$/i.test(path)) {
    return patternTokens(content, [
      [/^#{1,6}(?=\s)/g, "keyword"],
      [/`[^`]+`/g, "string"],
      [/\[[^\]]+\](?=\()/g, "property"],
    ])
  }
  if (/\.sql$/i.test(path)) {
    return patternTokens(content, [
      [
        /\b(?:alter|and|as|asc|begin|by|case|create|delete|desc|distinct|drop|else|end|from|group|having|insert|into|join|limit|not|null|on|or|order|returning|select|set|table|then|union|update|values|when|where)\b/gi,
        "keyword",
      ],
      [/'(?:''|[^'])*'/g, "string"],
      [/\b\d+(?:\.\d+)?\b/g, "number"],
    ])
  }
  return []
}

function patternTokens(
  content: string,
  patterns: [RegExp, SyntaxTokenKind][]
): SyntaxToken[] {
  const tokens = patterns.flatMap(([pattern, kind]) =>
    [...content.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      kind,
    }))
  )
  return normalizeTokens(tokens, content.length)
}
