"use client"

import type { GoogleCalendarOption, GoogleCalendarSource } from "@/lib/api"

export function CalendarSourcePicker({
  available,
  selected,
  disabled,
  onChange,
}: {
  available: GoogleCalendarOption[]
  selected: GoogleCalendarSource[]
  disabled: boolean
  onChange: (
    next: { connection_id: string; google_calendar_id: string }[]
  ) => void
}) {
  const selectedKeys = new Set(
    selected
      .filter((source) => source.enabled)
      .map((source) => `${source.connection_id}:${source.google_calendar_id}`)
  )
  const selectedValues = available.filter((calendar) =>
    selectedKeys.has(`${calendar.connection_id}:${calendar.google_calendar_id}`)
  )

  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Agendas nesta database
      </legend>
      {available.map((calendar) => {
        const key = `${calendar.connection_id}:${calendar.google_calendar_id}`
        const checked = selectedKeys.has(key)
        return (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const next = checked
                  ? selectedValues.filter(
                      (item) =>
                        `${item.connection_id}:${item.google_calendar_id}` !==
                        key
                    )
                  : [...selectedValues, calendar]
                onChange(
                  next.map((item) => ({
                    connection_id: item.connection_id,
                    google_calendar_id: item.google_calendar_id,
                  }))
                )
              }}
            />
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: calendar.color ?? "#64748b" }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">
              {calendar.display_name}
            </span>
            {calendar.primary ? (
              <span className="text-[11px] text-muted-foreground">
                Principal
              </span>
            ) : null}
          </label>
        )
      })}
    </fieldset>
  )
}
