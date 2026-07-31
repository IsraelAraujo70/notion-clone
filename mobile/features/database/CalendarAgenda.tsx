import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { CalendarProjectionEvent } from "@reason/core/contracts"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"

import { CalendarEventSheet } from "./CalendarEventSheet"
import {
  calendarAgendaRange,
  formatCalendarEventTime,
  groupCalendarAgendaEvents,
  resolvedCalendarTimeZone,
} from "./calendar-agenda"
import { calendarAgendaStyles as styles } from "./calendar-agenda.styles"
import { api } from "@/lib/api"
import { useAppTheme } from "@/lib/theme"

export function CalendarAgenda({
  token,
  workspaceId,
  databaseId,
  onOpenRow,
}: {
  token: string
  workspaceId: string
  databaseId: string
  onOpenRow: (rowId: string) => void
}) {
  const { tokens } = useAppTheme()
  const [anchor, setAnchor] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarProjectionEvent[]>([])
  const [selected, setSelected] = useState<CalendarProjectionEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const timeZone = useMemo(resolvedCalendarTimeZone, [])
  const range = useMemo(() => calendarAgendaRange(anchor), [anchor])
  const groups = useMemo(
    () => groupCalendarAgendaEvents(events, timeZone),
    [events, timeZone]
  )
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(anchor),
    [anchor]
  )

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(false)
    api
      .listCalendarEvents(
        token,
        workspaceId,
        databaseId,
        { ...range, timezone: timeZone },
        controller.signal
      )
      .then(
        (nextEvents) => {
          if (active) setEvents(nextEvents)
        },
        () => {
          if (active && !controller.signal.aborted) setError(true)
        }
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [databaseId, range, refreshKey, timeZone, token, workspaceId])

  function moveMonth(direction: -1 | 1) {
    setAnchor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + direction, 1)
    )
  }

  return (
    <View style={styles.agenda}>
      <View style={[styles.period, { borderBottomColor: tokens.border }]}>
        <View style={styles.periodTitle}>
          <Text style={[styles.eyebrow, { color: tokens.mutedForeground }]}>
            AGENDA
          </Text>
          <Text style={[styles.month, { color: tokens.foreground }]}>
            {monthLabel}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Hoje"
          onPress={() => setAnchor(new Date())}
          style={[styles.today, { borderColor: tokens.border }]}
        >
          <Text style={[styles.todayText, { color: tokens.foreground }]}>
            Hoje
          </Text>
        </Pressable>
        <PeriodButton
          icon="chevron-left"
          label="Mês anterior"
          onPress={() => moveMonth(-1)}
        />
        <PeriodButton
          icon="chevron-right"
          label="Próximo mês"
          onPress={() => moveMonth(1)}
        />
      </View>

      {loading && events.length === 0 ? (
        <View style={styles.state}>
          <ActivityIndicator color={tokens.ring} />
          <Text style={[styles.stateText, { color: tokens.mutedForeground }]}>
            Sincronizando agenda...
          </Text>
        </View>
      ) : error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRefreshKey((value) => value + 1)}
          style={[styles.error, { backgroundColor: `${tokens.destructive}12` }]}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={19}
            color={tokens.destructive}
          />
          <View style={styles.errorCopy}>
            <Text style={[styles.errorTitle, { color: tokens.destructive }]}>
              Não foi possível carregar a agenda
            </Text>
            <Text style={[styles.errorAction, { color: tokens.foreground }]}>
              Toque para tentar novamente.
            </Text>
          </View>
        </Pressable>
      ) : groups.length === 0 ? (
        <View style={styles.state}>
          <MaterialCommunityIcons
            name="calendar-blank-outline"
            size={24}
            color={tokens.mutedForeground}
          />
          <Text style={[styles.stateText, { color: tokens.mutedForeground }]}>
            Nenhum evento neste mês.
          </Text>
        </View>
      ) : (
        <View>
          {groups.map((group) => (
            <AgendaDay
              key={group.date}
              date={group.date}
              events={group.events}
              timeZone={timeZone}
              onSelect={setSelected}
            />
          ))}
        </View>
      )}

      {loading && events.length > 0 ? (
        <View style={styles.syncing}>
          <ActivityIndicator size="small" color={tokens.ring} />
          <Text style={[styles.syncingText, { color: tokens.mutedForeground }]}>
            Atualizando
          </Text>
        </View>
      ) : null}

      <CalendarEventSheet
        event={selected}
        displayTimeZone={timeZone}
        onClose={() => setSelected(null)}
        onOpenRow={onOpenRow}
      />
    </View>
  )
}

function AgendaDay({
  date,
  events,
  timeZone,
  onSelect,
}: {
  date: string
  events: CalendarProjectionEvent[]
  timeZone: string
  onSelect: (event: CalendarProjectionEvent) => void
}) {
  const { tokens } = useAppTheme()
  const value = new Date(`${date}T12:00:00`)
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(value)
    .replace(".", "")
    .toUpperCase()
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(value)
    .replace(".", "")
    .toUpperCase()
  return (
    <View style={[styles.day, { borderBottomColor: tokens.border }]}>
      <View style={styles.dateRail}>
        <Text style={[styles.dayNumber, { color: tokens.foreground }]}>
          {value.getDate()}
        </Text>
        <Text style={[styles.dayLabel, { color: tokens.mutedForeground }]}>
          {weekday} · {month}
        </Text>
      </View>
      <View style={styles.events}>
        {events.map((event) => (
          <AgendaEvent
            key={`${date}:${event.id}`}
            event={event}
            timeZone={timeZone}
            onPress={() => onSelect(event)}
          />
        ))}
      </View>
    </View>
  )
}

function AgendaEvent({
  event,
  timeZone,
  onPress,
}: {
  event: CalendarProjectionEvent
  timeZone: string
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  const cancelled = event.status === "cancelled"
  const color = /^#[\da-f]{6}$/i.test(event.color ?? "")
    ? event.color!
    : tokens.ring
  return (
    <Pressable
      accessibilityLabel={`${formatCalendarEventTime(event, timeZone)} ${event.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.event,
        {
          backgroundColor: tokens.muted,
          borderLeftColor: color,
          opacity: pressed || cancelled ? 0.66 : 1,
        },
      ]}
    >
      <Text style={[styles.time, { color: tokens.mutedForeground }]}>
        {formatCalendarEventTime(event, timeZone)}
      </Text>
      <View style={styles.eventTitleRow}>
        {event.meet_url ? (
          <MaterialCommunityIcons
            name="video-outline"
            size={15}
            color={tokens.mutedForeground}
          />
        ) : event.row_id ? (
          <MaterialCommunityIcons
            name="notebook-outline"
            size={15}
            color={tokens.mutedForeground}
          />
        ) : null}
        <Text
          numberOfLines={2}
          style={[
            styles.eventTitle,
            { color: tokens.foreground },
            cancelled && styles.cancelledTitle,
          ]}
        >
          {event.title}
        </Text>
      </View>
    </Pressable>
  )
}

function PeriodButton({
  icon,
  label,
  onPress,
}: {
  icon: string
  label: string
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.periodButton, { backgroundColor: tokens.muted }]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={21}
        color={tokens.foreground}
      />
    </Pressable>
  )
}
