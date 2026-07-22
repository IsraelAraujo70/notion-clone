import type { Metadata } from "next"

import { PullRequestReviewPage } from "@/components/code-review/templates/pull-request-review-page"

export const metadata: Metadata = {
  title: "Code review · reason",
}

export default function DashboardPullRequestReviewPage() {
  return <PullRequestReviewPage />
}
