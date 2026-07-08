import type { Metadata } from "next"

import { InvitePage } from "@/components/invite/invite-page"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"

export const metadata: Metadata = {
  title: "Convite · reason",
}

export default async function WorkspaceInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = "" } = await searchParams

  return (
    <AuthPageShell>
      <InvitePage token={token} />
    </AuthPageShell>
  )
}
