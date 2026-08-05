"use client"

import { useCallback, useEffect, useState } from "react"

import { api, type CalendarProjectionEvent } from "@/lib/api"

export interface CalendarRange {
  start: string
  end: string
  timezone: string
}

interface CalendarRequestState {
  key: string | null
  events: CalendarProjectionEvent[]
  error: Error | null
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
  const [state, setState] = useState<CalendarRequestState>({
    key: null,
    events: [],
    error: null,
  })
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const requestKey =
    enabled && token && workspaceId
      ? JSON.stringify([
          token,
          workspaceId,
          databaseId,
          range.start,
          range.end,
          range.timezone,
          revision,
        ])
      : null

  useEffect(() => {
    if (!requestKey || !token || !workspaceId) return
    const controller = new AbortController()
    void api
      .listCalendarEvents(
        token,
        workspaceId,
        databaseId,
        {
          start: range.start,
          end: range.end,
          timezone: range.timezone,
        },
        controller.signal
      )
      .then((events) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, events, error: null })
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key: requestKey,
            events: [],
            error: cause instanceof Error ? cause : new Error("Request failed"),
          })
        }
      })
    return () => controller.abort()
  }, [
    databaseId,
    range.end,
    range.start,
    range.timezone,
    requestKey,
    token,
    workspaceId,
  ])

  const current = requestKey !== null && state.key === requestKey
  return {
    events: current ? state.events : [],
    loading: requestKey !== null && !current,
    error: current ? state.error : null,
    refresh,
  }
}
