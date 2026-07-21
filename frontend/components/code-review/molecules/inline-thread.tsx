import type { ReviewThread } from "@/lib/code-review/contracts"
import { cn } from "@/lib/utils"

interface InlineThreadProps {
  thread: ReviewThread
}

export function InlineThread({ thread }: InlineThreadProps) {
  return (
    <article
      aria-label={`Review thread on ${thread.path} line ${thread.line}`}
      className={cn(
        "mx-3 my-2 overflow-hidden rounded-lg border bg-background shadow-sm",
        thread.isResolved && "opacity-70"
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium">
          {thread.isResolved ? "Resolved thread" : "Review thread"}
        </span>
        {thread.isOutdated && (
          <span className="text-muted-foreground">Outdated</span>
        )}
      </header>
      <div className="divide-y">
        {thread.comments.map((comment) => (
          <div key={comment.id} className="px-3 py-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
              <strong>{comment.author.login}</strong>
              <time
                className="text-muted-foreground"
                dateTime={comment.createdAt}
              >
                {comment.createdAt}
              </time>
            </div>
            <p className="text-sm leading-6 whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </article>
  )
}
