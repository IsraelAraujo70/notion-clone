import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth/organisms/reset-password-form"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"
import { LocalizedDocumentTitle } from "@/components/localized-document-title"

export const metadata: Metadata = {
  title: "Reset password · reason",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = "" } = await searchParams

  return (
    <AuthPageShell>
      <LocalizedDocumentTitle title="Reset password" />
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  )
}
