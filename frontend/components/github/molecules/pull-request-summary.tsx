import { Code2Icon, ExternalLinkIcon, GitPullRequestIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { GitHubPullRequestLink } from "@/lib/api"

export function PullRequestSummary({
  link,
  onReview,
}: {
  link: GitHubPullRequestLink
  onReview: () => void
}) {
  return (
    <section className="mb-6 flex min-w-0 items-center gap-3 rounded-lg border bg-muted/15 px-3 py-2">
      <GitPullRequestIcon className="size-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {link.owner}/{link.repository}#{link.pull_number}
          </span>
          <span className="capitalize">
            {link.draft ? "draft" : link.state}
          </span>
          <span className="font-mono">
            <span className="text-emerald-700 dark:text-emerald-400">
              +{link.additions}
            </span>{" "}
            <span className="text-red-700 dark:text-red-400">
              -{link.deletions}
            </span>
          </span>
        </div>
        <p className="truncate text-sm font-medium" title={link.title}>
          {link.title}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onReview}>
        <Code2Icon data-icon="inline-start" /> Review
      </Button>
      <Button size="icon-sm" variant="ghost" asChild>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open pull request on GitHub"
        >
          <ExternalLinkIcon />
        </a>
      </Button>
    </section>
  )
}
