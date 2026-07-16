"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"

import { PasswordInput } from "@/components/auth/molecules/password-input"
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
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { isStrongPassword } from "@/lib/passwordStrength"

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const passwordReady = isStrongPassword(password)
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!token) {
      setError(t("The reset link is missing its token."))
      return
    }
    if (!passwordReady) {
      setError(t("Use a stronger password before saving."))
      return
    }
    if (password !== confirmPassword) {
      setError(t("Passwords do not match."))
      return
    }

    setPending(true)
    try {
      await api.resetPassword({ token, password })
      setDone(true)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not reach the server. Try again.")
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {t("Reset password")}
          </CardTitle>
          <CardDescription>
            {t("Choose a stronger password for your workspace.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          {done && (
            <Alert role="status">
              <AlertTitle>
                {t("Password changed. Sign in with your new password.")}
              </AlertTitle>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={!passwordReady && password.length > 0}>
              <FieldLabel htmlFor="new-password">
                {t("New password")}
              </FieldLabel>
              <PasswordInput
                id="new-password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                showStrength
                aria-invalid={!passwordReady && password.length > 0}
                disabled={done}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field data-invalid={passwordsMismatch}>
              <FieldLabel htmlFor="confirm-new-password">
                {t("Confirm password")}
              </FieldLabel>
              <PasswordInput
                id="confirm-new-password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={passwordsMismatch}
                disabled={done}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              {passwordsMismatch && (
                <FieldDescription>
                  {t("Passwords do not match.")}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          {!done ? (
            <Button
              type="submit"
              className="w-full"
              disabled={
                pending ||
                !token ||
                !passwordReady ||
                password !== confirmPassword
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? t("Saving password...") : t("Save new password")}
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link href="/login">{t("Sign in")}</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  )
}
