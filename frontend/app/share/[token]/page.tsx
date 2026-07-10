import type { Metadata } from "next"

import { PublicPage } from "@/components/share/public-page"

export const metadata: Metadata = {
  title: "Página compartilhada · reason",
}

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicPage token={token} />
}
