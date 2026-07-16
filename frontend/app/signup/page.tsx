import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/organisms/signup-form"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Create account · reason",
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite = "" } = await searchParams

  return (
    <AuthPageShell>
      <LocalizedDocumentTitle title="Create account" />
      <SignupForm inviteToken={invite} />
    </AuthPageShell>
  )
}
