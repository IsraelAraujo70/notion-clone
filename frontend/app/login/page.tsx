import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/organisms/login-form"
import { AuthPageShell } from "@/components/auth/templates/auth-page-shell"

export const metadata: Metadata = {
  title: "Entrar · reason",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite = "" } = await searchParams

  return (
    <AuthPageShell>
      <LoginForm inviteToken={invite} />
    </AuthPageShell>
  )
}
