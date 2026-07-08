"use client"

import { useState, type FormEvent } from "react"

import { PasswordInput } from "@/components/auth/molecules/password-input"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { isStrongPassword } from "@/lib/passwordStrength"

export function ChangePasswordForm() {
  const { token } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const passwordReady = isStrongPassword(newPassword)
  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!token) {
      setError("Sessão ausente.")
      return
    }
    if (!passwordReady) {
      setError("Use uma senha mais forte antes de salvar.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.")
      return
    }

    setPending(true)
    try {
      await api.changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setNotice("Senha alterada. Suas outras sessões foram encerradas.")
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Não foi possível alterar a senha."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field data-invalid={!passwordReady && newPassword.length > 0}>
          <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            showStrength
            value={newPassword}
            aria-invalid={!passwordReady && newPassword.length > 0}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field data-invalid={passwordsMismatch}>
          <FieldLabel htmlFor="confirm-new-password">
            Confirmar nova senha
          </FieldLabel>
          <PasswordInput
            id="confirm-new-password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            aria-invalid={passwordsMismatch}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {passwordsMismatch && (
            <FieldDescription>As senhas não conferem.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        className="w-fit"
        disabled={
          pending ||
          !currentPassword ||
          !passwordReady ||
          newPassword !== confirmPassword
        }
      >
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Salvando..." : "Alterar senha"}
      </Button>
    </form>
  )
}
