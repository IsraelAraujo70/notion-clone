import type { FormEvent } from "react"

import { Button } from "@/components/ui/button"
import type { ReviewLineRange } from "@/lib/code-review/line-selection"

interface CommentEditorProps {
  selection: ReviewLineRange
  value: string
  submitting?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function CommentEditor({
  selection,
  value,
  submitting = false,
  onChange,
  onSubmit,
  onCancel,
}: CommentEditorProps) {
  const lineLabel =
    selection.startLine === selection.endLine
      ? `line ${selection.startLine}`
      : `lines ${selection.startLine}-${selection.endLine}`

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (value.trim() && !submitting) onSubmit()
  }

  return (
    <form className="border-t bg-muted/20 p-3" onSubmit={submit}>
      <label
        htmlFor="review-comment"
        className="mb-2 block text-sm font-medium"
      >
        Comment on {selection.side.toLowerCase()} {lineLabel}
      </label>
      <textarea
        id="review-comment"
        rows={4}
        value={value}
        disabled={submitting}
        placeholder="Leave a review comment"
        className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!value.trim() || submitting}>
          {submitting ? "Submitting..." : "Add comment"}
        </Button>
      </div>
    </form>
  )
}
