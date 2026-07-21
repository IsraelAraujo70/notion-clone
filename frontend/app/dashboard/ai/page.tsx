import type { Metadata } from "next"

import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Reason AI · reason",
}

export default function DashboardAiPage() {
  return <LocalizedDocumentTitle title="Reason AI" />
}
