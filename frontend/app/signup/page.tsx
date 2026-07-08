import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/organisms/signup-form"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"

export const metadata: Metadata = {
  title: "Criar conta · reason",
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite = "" } = await searchParams

  return (
    <AuthPageShell>
      <SignupForm inviteToken={invite} />
    </AuthPageShell>
  )
}
