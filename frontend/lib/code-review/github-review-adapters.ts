import type { GitHubPullRequestFile, GitHubPullRequestLink } from "../api"
import type { PullRequest, ReviewFile } from "./contracts"

export function toPullRequest(link: GitHubPullRequestLink): PullRequest {
  const author = link.author_login ?? "ghost"
  return {
    id: link.id,
    number: link.pull_number,
    title: link.title,
    body: link.body,
    state:
      link.state === "open" ||
      link.state === "closed" ||
      link.state === "merged"
        ? link.state
        : "closed",
    isDraft: link.draft,
    author: { id: author, login: author },
    base: { label: link.base_ref, ref: link.base_ref, sha: "" },
    head: { label: link.head_ref, ref: link.head_ref, sha: link.head_sha },
    additions: link.additions,
    deletions: link.deletions,
    changedFiles: link.changed_files,
    createdAt: link.created_at,
    updatedAt: link.updated_at,
    url: link.url,
  }
}

export function toReviewFile(file: GitHubPullRequestFile): ReviewFile {
  const statuses: ReviewFile["status"][] = [
    "added",
    "modified",
    "removed",
    "renamed",
    "copied",
    "changed",
  ]
  return {
    path: file.path,
    previousPath: file.previous_filename ?? undefined,
    status: statuses.includes(file.status as ReviewFile["status"])
      ? (file.status as ReviewFile["status"])
      : "changed",
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  }
}
