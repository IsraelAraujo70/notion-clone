import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { AiCitation, AiMessage as Message } from "@/lib/ai/contracts"
import { AiCitation as CitationButton } from "../atoms/ai-citation"

const markdownComponents = {
  a: ({ children, href }: React.ComponentPropsWithoutRef<"a">) =>
    href ? (
      <a
        className="text-primary underline underline-offset-2 hover:no-underline"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  blockquote: ({ children }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: React.ComponentPropsWithoutRef<"code">) => (
    <code
      className={`${className ?? ""} rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]`}
    >
      {children}
    </code>
  ),
  h1: ({ children }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mb-2 mt-4 text-lg font-semibold">{children}</h1>
  ),
  h2: ({ children }: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mb-2 mt-4 text-base font-semibold">{children}</h2>
  ),
  h3: ({ children }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mb-1 mt-3 font-semibold">{children}</h3>
  ),
  ol: ({ children }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  p: ({ children }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="my-2 first:mt-0 last:mb-0">{children}</p>
  ),
  pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }: React.ComponentPropsWithoutRef<"table">) => (
    <table className="my-3 block w-full overflow-x-auto border-collapse text-left text-xs [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2">
      {children}
    </table>
  ),
  ul: ({ children }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
}

export function AiMessage({
  message,
  onOpenCitation,
}: {
  message: Message
  onOpenCitation: (citation: AiCitation) => void
}) {
  return (
    <article
      className={
        message.role === "user"
          ? "ml-8 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
          : "mr-4 text-sm leading-6"
      }
    >
      {message.role === "assistant" ? (
        <div className="min-w-0 break-words">
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{message.content}</p>
      )}
      {message.citations?.length ? (
        <div className="mt-2 space-y-1.5">
          {message.citations.map((citation) => (
            <CitationButton
              key={`${citation.page_id}:${citation.block_id}`}
              citation={citation}
              onOpen={onOpenCitation}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
