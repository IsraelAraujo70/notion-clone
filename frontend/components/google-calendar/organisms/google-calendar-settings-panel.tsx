"use client"

import { Loader2Icon, LogOutIcon, Settings2Icon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { CalendarSourcePicker } from "./calendar-source-picker"
import {
  api,
  type GoogleCalendarConnection,
  type GoogleCalendarSources,
} from "@/lib/api"

export function GoogleCalendarSettingsPanel({
  token,
  workspaceId,
  databaseId,
  onSourcesChanged,
}: {
  token: string
  workspaceId: string
  databaseId: string
  onSourcesChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<GoogleCalendarSources | null>(null)
  const [connections, setConnections] = useState<GoogleCalendarConnection[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSources, nextConnections] = await Promise.all([
        api.getGoogleCalendarSources(token, workspaceId, databaseId),
        api.listGoogleCalendarConnections(token),
      ])
      setSources(nextSources)
      setConnections(nextConnections)
    } catch {
      toast.error("Não foi possível carregar as agendas")
    } finally {
      setLoading(false)
    }
  }, [databaseId, token, workspaceId])

  useEffect(() => {
    if (open) void load()
  }, [load, open])

  const connect = async () => {
    try {
      const result = await api.startGoogleCalendarOAuth(
        token,
        workspaceId,
        databaseId
      )
      window.location.assign(result.authorization_url)
    } catch {
      toast.error("Não foi possível iniciar a conexão com o Google")
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2Icon className="size-3.5" />
        Agendas
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Configurar Google Calendar"
          className="absolute top-10 right-0 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Google Calendar</h3>
              <p className="text-xs text-muted-foreground">
                Só você vê eventos ainda sem notas.
              </p>
            </div>
            {loading ? <Loader2Icon className="size-4 animate-spin" /> : null}
          </div>
          {!sources?.configured ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              A integração ainda não foi configurada neste ambiente.
            </p>
          ) : null}
          {connections
            .filter((item) => !item.revoked_at)
            .map((connection) => (
              <div
                key={connection.id}
                className="mb-3 flex items-center gap-2 rounded-md border px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs">
                  {connection.account_email}
                </span>
                <button
                  type="button"
                  aria-label={`Desconectar ${connection.account_email}`}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={async () => {
                    await api.disconnectGoogleCalendar(token, connection.id)
                    await load()
                    onSourcesChanged()
                  }}
                >
                  <LogOutIcon className="size-3.5" />
                </button>
              </div>
            ))}
          {sources && sources.available.length > 0 ? (
            <CalendarSourcePicker
              available={sources.available}
              selected={sources.sources}
              disabled={loading}
              onChange={async (selection) => {
                setLoading(true)
                try {
                  setSources(
                    await api.replaceGoogleCalendarSources(
                      token,
                      workspaceId,
                      databaseId,
                      selection
                    )
                  )
                  onSourcesChanged()
                } catch {
                  toast.error("Não foi possível salvar as agendas")
                } finally {
                  setLoading(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              disabled={!sources?.configured}
              className="mt-2 h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              onClick={connect}
            >
              Conectar conta Google
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
