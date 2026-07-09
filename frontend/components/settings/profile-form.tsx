"use client"

import { useRef, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"

function initials(displayName: string) {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function ProfileForm() {
  const { user, token, refreshUser } = useAuth()
  const [displayName, setDisplayName] = useState(user?.display_name ?? "")
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    user?.avatar_url ?? null
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user || !token) return null

  const onSaveName = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.updateProfile(token, { display_name: displayName.trim() })
      await refreshUser()
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível salvar o nome"
      )
    } finally {
      setSaving(false)
    }
  }

  const onPickFile = async (file: File | null) => {
    if (!file || !token) return
    setUploading(true)
    setError(null)
    setSaved(false)
    try {
      const presign = await api.presignAvatar(token, file.type)
      const headers = new Headers()
      for (const header of presign.headers) {
        headers.set(header.name, header.value)
      }
      const put = await fetch(presign.upload_url, {
        method: "PUT",
        headers,
        body: file,
      })
      if (!put.ok) {
        throw new Error("Upload falhou")
      }
      await api.updateProfile(token, { avatar_key: presign.key })
      setPreviewUrl(presign.public_url)
      await refreshUser()
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar a foto (verifique o MinIO/S3)"
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-4" data-cy="profile-form">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 rounded-full">
          {previewUrl ? <AvatarImage src={previewUrl} alt={displayName} /> : null}
          <AvatarFallback className="text-base">
            {initials(displayName || user.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-cy="avatar-file-input"
            onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            data-cy="avatar-upload-button"
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Enviando…" : "Trocar foto"}
          </Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · até 2 MB</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="profile-display-name">Nome de exibição</Label>
        <Input
          id="profile-display-name"
          data-cy="profile-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={100}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-cy="profile-save"
          disabled={saving || !displayName.trim()}
          onClick={() => void onSaveName()}
        >
          {saving ? "Salvando…" : "Salvar nome"}
        </Button>
        {saved ? (
          <span className="text-xs text-muted-foreground" data-cy="profile-saved">
            Salvo
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" data-cy="profile-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
