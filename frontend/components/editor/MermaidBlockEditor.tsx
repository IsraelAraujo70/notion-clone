"use client"

import { Code2Icon, EyeIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { useAppTheme } from "@/components/theme/theme-provider"
import { useI18n } from "@/lib/i18n/i18n-provider"

export interface MermaidBlockEditorHandle {
  focus: (offset: number) => void
}

interface MermaidBlockEditorProps {
  blockId: string
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  onExit: () => void
  onMergeBackward: () => void
  onMoveFocus: (direction: -1 | 1) => void
  onUndo: () => void
  onRedo: () => void
}

const MAX_SOURCE_LENGTH = 50_000

export const MermaidBlockEditor = React.forwardRef<
  MermaidBlockEditorHandle,
  MermaidBlockEditorProps
>(function MermaidBlockEditor(
  {
    blockId,
    value,
    readOnly,
    onChange,
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
  const { t } = useI18n()
  const { mode } = useAppTheme()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const renderSequence = React.useRef(0)
  const [editing, setEditing] = React.useState(() => !value.trim())
  const [svg, setSvg] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useImperativeHandle(ref, () => ({
    focus(offset) {
      setEditing(true)
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        const position = Math.max(0, Math.min(offset, textarea.value.length))
        textarea.focus()
        textarea.setSelectionRange(position, position)
      })
    },
  }))

  React.useEffect(() => {
    const sequence = ++renderSequence.current
    const source = value.trim()
    if (!source) {
      setSvg("")
      setError(null)
      return
    }
    if (value.length > MAX_SOURCE_LENGTH) {
      setError(t("Mermaid source is too large"))
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          maxTextSize: MAX_SOURCE_LENGTH,
          maxEdges: 500,
          theme: "base",
          themeVariables:
            mode === "dark"
              ? {
                  background: "#202124",
                  primaryColor: "#2f3136",
                  primaryBorderColor: "#73767d",
                  primaryTextColor: "#f1f3f5",
                  lineColor: "#a7abb2",
                  secondaryColor: "#25272b",
                  tertiaryColor: "#35383e",
                }
              : {
                  background: "#ffffff",
                  primaryColor: "#f7f7f5",
                  primaryBorderColor: "#c8c8c5",
                  primaryTextColor: "#37352f",
                  lineColor: "#787774",
                  secondaryColor: "#fbfbfa",
                  tertiaryColor: "#eeeeec",
                },
          flowchart: { htmlLabels: false, useMaxWidth: true },
        })
        const result = await mermaid.render(
          `reason-mermaid-${blockId}-${sequence}`,
          value
        )
        if (sequence !== renderSequence.current) return
        setSvg(result.svg)
        setError(null)
      } catch {
        if (sequence === renderSequence.current) {
          setError(t("Mermaid syntax could not be rendered"))
        }
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [blockId, mode, t, value])

  return (
    <section
      data-cy={`mermaid-block-${blockId}`}
      className="overflow-hidden rounded-md border bg-card"
      onContextMenuCapture={(event) => event.stopPropagation()}
    >
      <div className="flex h-9 items-center justify-between border-b bg-muted/40 px-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          MERMAID
        </span>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? <EyeIcon /> : <Code2Icon />}
            {editing ? t("Preview") : t("Edit diagram")}
          </Button>
        ) : null}
      </div>

      {editing && !readOnly ? (
        <textarea
          ref={textareaRef}
          data-cy={`mermaid-source-${blockId}`}
          aria-label={t("Mermaid source")}
          value={value}
          spellCheck={false}
          placeholder={"flowchart LR\n  Idea --> Draft --> Publish"}
          className="block min-h-32 w-full resize-y border-0 bg-muted/60 px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onChange={(event) => onChange(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(event) => {
            const start = event.currentTarget.selectionStart
            const end = event.currentTarget.selectionEnd
            const key = event.key.toLowerCase()
            if (
              (event.metaKey || event.ctrlKey) &&
              (key === "z" || key === "y")
            ) {
              event.preventDefault()
              if (key === "y" || event.shiftKey) onRedo()
              else onUndo()
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setEditing(false)
              onExit()
              return
            }
            if (event.key === "Backspace" && start === 0 && end === 0) {
              event.preventDefault()
              onMergeBackward()
              return
            }
            if (event.key === "ArrowUp" && start === 0 && end === 0) {
              event.preventDefault()
              onMoveFocus(-1)
              return
            }
            if (
              event.key === "ArrowDown" &&
              start === value.length &&
              end === value.length
            ) {
              event.preventDefault()
              onMoveFocus(1)
            }
          }}
        />
      ) : null}

      <div
        className="min-h-28 overflow-auto p-4"
        data-cy={`mermaid-preview-${blockId}`}
      >
        {svg ? (
          <div
            className="mx-auto min-w-fit [&_svg]:mx-auto [&_svg]:max-h-[70vh] [&_svg]:max-w-full"
            aria-label={t("Mermaid diagram")}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
            {t("Add Mermaid source to render a diagram")}
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
})
