import type { Metadata } from "next"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export const metadata: Metadata = {
  title: "Sem título · reason",
}

export default async function DashboardPagePage({
  params,
}: {
  params: Promise<{ pageId: string }>
}) {
  const { pageId } = await params
  return <DashboardShell pageId={pageId} />
}
