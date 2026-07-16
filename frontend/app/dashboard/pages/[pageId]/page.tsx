import type { Metadata } from "next"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Untitled · reason",
}

export default async function DashboardPagePage({
  params,
}: {
  params: Promise<{ pageId: string }>
}) {
  const { pageId } = await params
  return (
    <>
      <LocalizedDocumentTitle title="Untitled" />
      <DashboardShell pageId={pageId} />
    </>
  )
}
