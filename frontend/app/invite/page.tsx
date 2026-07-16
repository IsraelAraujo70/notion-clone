import type { Metadata } from "next"

import { InvitePage } from "@/components/invite/invite-page"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Invitation · reason",
}

export default async function WorkspaceInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = "" } = await searchParams

  return (
    <AuthPageShell>
      <LocalizedDocumentTitle title="Invitation" />
      <InvitePage token={token} />
    </AuthPageShell>
  )
}
