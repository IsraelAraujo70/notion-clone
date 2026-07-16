"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/molecules/password-input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useI18n } from "@/lib/i18n/i18n-provider"

export function LoginForm({ inviteToken }: { inviteToken?: string }) {
  const { login } = useAuth()
  const { t } = useI18n()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      if (forgotMode) {
        await api.requestPasswordReset({ email })
        setNotice(
          t("If an account exists for this email, a reset link was sent.")
        )
        setPending(false)
        return
      }

      const response = await login({ email, password })
      if (inviteToken) {
        await api.acceptWorkspaceInvite(response.token, inviteToken)
      }
      router.replace("/dashboard")
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not reach the server. Try again.")
      )
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {t("Welcome back")}
          </CardTitle>
          <CardDescription>
            {forgotMode
              ? t("Send a reset link to your email.")
              : t("Sign in to access your workspace.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          {notice && (
            <Alert role="status">
              <AlertTitle>{notice}</AlertTitle>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t("Email")}</FieldLabel>
              <Input
                id="email"
                data-cy="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            {!forgotMode && (
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0"
                    onClick={() => {
                      setForgotMode(true)
                      setError(null)
                      setNotice(null)
                    }}
                  >
                    {t("Forgot password?")}
                  </Button>
                </div>
                <PasswordInput
                  id="password"
                  data-cy="login-password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            )}
            {forgotMode && (
              <Field>
                <FieldDescription>
                  {t("The reset link expires in one hour.")}
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            data-cy="login-submit"
            className="w-full"
            disabled={pending}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {pending
              ? forgotMode
                ? t("Sending link...")
                : t("Signing in...")
              : forgotMode
                ? t("Send link")
                : t("Sign in")}
          </Button>
          {forgotMode && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setForgotMode(false)
                setError(null)
                setNotice(null)
              }}
            >
              {t("Back to sign in")}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {t("New here?")}{" "}
            <Link
              href={inviteToken ? `/signup?invite=${inviteToken}` : "/signup"}
              className="text-primary hover:underline"
            >
              {t("Create account")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </form>
  )
}
