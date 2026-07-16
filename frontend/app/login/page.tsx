import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/organisms/login-form"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Sign in · reason",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite = "" } = await searchParams

  return (
    <AuthPageShell>
      <LocalizedDocumentTitle title="Sign in" />
      <LoginForm inviteToken={invite} />
    </AuthPageShell>
  )
}
