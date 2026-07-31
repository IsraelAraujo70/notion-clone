"use client"

import { useCallback, useEffect, useState } from "react"

import { api, type CalendarProjectionEvent } from "@/lib/api"

export interface CalendarRange {
  start: string
  end: string
  timezone: string
}

export function useGoogleCalendarEvents({
  token,
  workspaceId,
  databaseId,
  range,
  enabled,
}: {
  token?: string | null
  workspaceId?: string
  databaseId: string
  range: CalendarRange
  enabled: boolean
}) {
  const [events, setEvents] = useState<CalendarProjectionEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!enabled || !token || !workspaceId) {
      setEvents([])
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void api
      .listCalendarEvents(
        token,
        workspaceId,
        databaseId,
        range,
        controller.signal
      )
      .then(setEvents)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause : new Error("Request failed"))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [
    databaseId,
    enabled,
    range.end,
    range.start,
    range.timezone,
    revision,
    token,
    workspaceId,
  ])

  return { events, loading, error, refresh }
}
