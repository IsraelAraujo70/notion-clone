export type ReviewSide = "LEFT" | "RIGHT"

export type PullRequestState = "open" | "closed" | "merged"
export type ReviewDecision =
  "approved" | "changes_requested" | "commented" | "pending"

export type ReviewFileStatus =
  "added" | "modified" | "removed" | "renamed" | "copied" | "changed"

export interface ReviewAuthor {
  id: string
  login: string
  avatarUrl?: string
  url?: string
}

export interface PullRequestRef {
  label: string
  ref: string
  sha: string
}

export interface PullRequest {
  id: string
  number: number
  title: string
  body: string | null
  state: PullRequestState
  isDraft: boolean
  author: ReviewAuthor
  base: PullRequestRef
  head: PullRequestRef
  additions: number
  deletions: number
  changedFiles: number
  createdAt: string
  updatedAt: string
  url?: string
}

export interface ReviewFile {
  path: string
  previousPath?: string
  status: ReviewFileStatus
  additions: number
  deletions: number
  changes: number
  patch: string | null
  isBinary?: boolean
}

export interface ReviewLineAddress {
  path: string
  hunkId: string
  side: ReviewSide
  line: number
}

export interface ReviewComment {
  id: string
  author: ReviewAuthor
  body: string
  createdAt: string
  updatedAt?: string
  url?: string
}

export interface ReviewThread {
  id: string
  path: string
  side: ReviewSide
  line: number
  startSide?: ReviewSide
  startLine?: number
  isResolved: boolean
  isOutdated?: boolean
  comments: ReviewComment[]
}

export interface ReviewSubmission {
  id: string
  author: ReviewAuthor
  decision: Exclude<ReviewDecision, "pending">
  body: string | null
  submittedAt: string
}

export type ReviewEvent =
  | {
      id: string
      type: "review_submitted"
      actor: ReviewAuthor
      createdAt: string
      review: ReviewSubmission
    }
  | {
      id: string
      type: "thread_created" | "thread_resolved" | "thread_reopened"
      actor: ReviewAuthor
      createdAt: string
      threadId: string
      path: string
    }
  | {
      id: string
      type: "comment_added"
      actor: ReviewAuthor
      createdAt: string
      threadId: string
      comment: ReviewComment
    }
