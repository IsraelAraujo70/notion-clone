import type { Metadata } from "next"

import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Untitled · reason",
}

export default function DashboardPage() {
  return <LocalizedDocumentTitle title="Untitled" />
}
