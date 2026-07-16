import type { Metadata } from "next"

import { PublicPage } from "@/components/share/public-page"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Shared page · reason",
}

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <>
      <LocalizedDocumentTitle title="Shared page" />
      <PublicPage token={token} />
    </>
  )
}
