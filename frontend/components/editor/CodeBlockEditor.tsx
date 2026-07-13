"use client"

import {
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state"
import { defaultKeymap, indentWithTab } from "@codemirror/commands"
import { cpp } from "@codemirror/lang-cpp"
import { css } from "@codemirror/lang-css"
import { go } from "@codemirror/lang-go"
import { html } from "@codemirror/lang-html"
import { java } from "@codemirror/lang-java"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { rust } from "@codemirror/lang-rust"
import { sql } from "@codemirror/lang-sql"
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { EditorView, keymap } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { csharp } from "@replit/codemirror-lang-csharp"
import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const CODE_LANGUAGES = [
  { value: "plaintext", label: "Texto simples" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
] as const

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]["value"]

export interface CodeBlockEditorHandle {
  focus: (offset: number) => void
}

interface CodeBlockEditorProps {
  blockId: string
  value: string
  language: string | undefined
  readOnly: boolean
  onChange: (value: string) => void
  onLanguageChange: (language: CodeLanguage) => void
  onFocus: () => void
  onBlur: () => void
  onExit: () => void
  onMergeBackward: () => void
  onMoveFocus: (direction: -1 | 1) => void
  onUndo: () => void
  onRedo: () => void
}

function normalizeLanguage(language: string | undefined): CodeLanguage {
  return CODE_LANGUAGES.some((option) => option.value === language)
    ? (language as CodeLanguage)
    : "plaintext"
}

function languageExtension(language: CodeLanguage): Extension {
  switch (language) {
    case "javascript":
      return javascript()
    case "typescript":
      return javascript({ typescript: true })
    case "jsx":
      return javascript({ jsx: true })
    case "tsx":
      return javascript({ jsx: true, typescript: true })
    case "html":
      return html()
    case "css":
      return css()
    case "json":
      return json()
    case "markdown":
      return markdown()
    case "bash":
      return StreamLanguage.define(shell)
    case "sql":
      return sql()
    case "python":
      return python()
    case "rust":
      return rust()
    case "go":
      return go()
    case "java":
      return java()
    case "csharp":
      return csharp()
    case "cpp":
      return cpp()
    case "plaintext":
      return []
  }
}

const codeTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--muted)",
    borderRadius: "calc(var(--radius) - 2px)",
    color: "var(--foreground)",
    fontSize: "0.875rem",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    lineHeight: "1.5rem",
    minHeight: "3rem",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    minHeight: "3rem",
    padding: "0.5rem 0.75rem",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 28%, transparent)",
  },
  "&.cm-focused": { outline: "2px solid color-mix(in srgb, var(--ring) 70%, transparent)" },
})

const codeHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], color: "var(--primary)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--success)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--destructive)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "color-mix(in srgb, var(--primary) 72%, var(--destructive))" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "color-mix(in srgb, var(--primary) 78%, var(--success))" },
])

export const CodeBlockEditor = React.forwardRef<
  CodeBlockEditorHandle,
  CodeBlockEditorProps
>(function CodeBlockEditor(
  {
    blockId,
    value,
    language,
    readOnly,
    onChange,
    onLanguageChange,
    onFocus,
    onBlur,
    onExit,
    onMergeBackward,
    onMoveFocus,
    onUndo,
    onRedo,
  },
  ref
) {
  const mountRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const languageCompartment = React.useRef(new Compartment())
  const editableCompartment = React.useRef(new Compartment())
  const syncingValue = React.useRef(false)
  const callbacksRef = React.useRef({
    onChange,
    onFocus,
    onBlur,
    onExit,
    onMergeBackward,
    onMoveFocus,
    onUndo,
    onRedo,
  })
  callbacksRef.current = {
    onChange,
    onFocus,
    onBlur,
    onExit,
    onMergeBackward,
    onMoveFocus,
    onUndo,
    onRedo,
  }
  const normalizedLanguage = normalizeLanguage(language)

  React.useImperativeHandle(ref, () => ({
    focus(offset) {
      const view = viewRef.current
      if (!view) return
      const position = Math.max(0, Math.min(offset, view.state.doc.length))
      view.focus()
      view.dispatch({ selection: { anchor: position } })
    },
  }))

  React.useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const codeKeymap = keymap.of([
      {
        key: "Shift-Enter",
        run: () => {
          callbacksRef.current.onExit()
          return true
        },
      },
      {
        key: "Escape",
        run: () => {
          callbacksRef.current.onExit()
          return true
        },
      },
      {
        key: "Backspace",
        run: (view) => {
          if (view.state.selection.main.from !== 0) return false
          callbacksRef.current.onMergeBackward()
          return true
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          const selection = view.state.selection.main
          const line = view.state.doc.lineAt(selection.head)
          if (selection.head !== line.from) return false
          callbacksRef.current.onMoveFocus(-1)
          return true
        },
      },
      {
        key: "ArrowDown",
        run: (view) => {
          const selection = view.state.selection.main
          const line = view.state.doc.lineAt(selection.head)
          if (selection.head !== line.to) return false
          callbacksRef.current.onMoveFocus(1)
          return true
        },
      },
      indentWithTab,
      ...defaultKeymap,
    ])

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          codeTheme,
          syntaxHighlighting(codeHighlightStyle),
          languageCompartment.current.of(languageExtension(normalizedLanguage)),
          editableCompartment.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          codeKeymap,
          EditorView.contentAttributes.of({
            "aria-label": "Código",
            spellcheck: "false",
          }),
          EditorView.domEventHandlers({
            focus: () => {
              callbacksRef.current.onFocus()
              return false
            },
            blur: () => {
              callbacksRef.current.onBlur()
              return false
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingValue.current) {
              callbacksRef.current.onChange(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: mount,
    })
    viewRef.current = view
    // O histórico é o da árvore de operações, não uma segunda pilha local do
    // CodeMirror. Captura antes do handler interno para funcionar em macOS e
    // Windows/Linux com a mesma semântica.
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (
        !(event.metaKey || event.ctrlKey) ||
        (key !== "z" && key !== "y")
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (key === "y" || event.shiftKey) callbacksRef.current.onRedo()
      else callbacksRef.current.onUndo()
    }
    mount.addEventListener("keydown", handleHistoryShortcut, true)

    return () => {
      mount.removeEventListener("keydown", handleHistoryShortcut, true)
      if (viewRef.current === view) viewRef.current = null
      view.destroy()
    }
    // O EditorView é criado uma vez. As props vivas ficam em callbacksRef e
    // os valores externos são aplicados pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    const selection = view.state.selection.main
    syncingValue.current = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
    })
    syncingValue.current = false
  }, [value])

  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: languageCompartment.current.reconfigure(
        languageExtension(normalizedLanguage)
      ),
    })
  }, [normalizedLanguage])

  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    })
  }, [readOnly])

  return (
    <div className="overflow-hidden rounded-md bg-muted" data-cy={`code-shell-${blockId}`}>
      <div className="flex h-9 items-center justify-between border-b border-border/70 px-2">
        <span className="text-xs font-medium text-muted-foreground">Código</span>
        <Select
          value={normalizedLanguage}
          onValueChange={(next) => onLanguageChange(normalizeLanguage(next))}
          disabled={readOnly}
        >
          <SelectTrigger
            size="sm"
            data-cy={`code-language-${blockId}`}
            aria-label="Linguagem do código"
            className="border-0 bg-transparent text-xs shadow-none hover:bg-background/50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGES.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                data-cy={`code-language-option-${option.value}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div ref={mountRef} data-cy={`code-editor-${blockId}`} />
    </div>
  )
})
