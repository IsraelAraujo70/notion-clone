import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { CalendarProjectionEvent } from "@reason/core/contracts"
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { formatCalendarEventRange } from "./calendar-agenda"
import { fonts, useAppTheme } from "@/lib/theme"

export function CalendarEventSheet({
  event,
  displayTimeZone,
  onClose,
  onOpenRow,
}: {
  event: CalendarProjectionEvent | null
  displayTimeZone: string
  onClose: () => void
  onOpenRow: (rowId: string) => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Modal
      visible={event !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.host}>
        <Pressable
          accessibilityLabel="Fechar detalhes do evento"
          style={styles.backdrop}
          onPress={onClose}
        />
        {event ? (
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.sheet,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: tokens.input }]} />
            <View style={styles.header}>
              <View style={styles.titleGroup}>
                <Text
                  style={[styles.eyebrow, { color: tokens.mutedForeground }]}
                >
                  {event.origin === "manual"
                    ? "LINHA DA DATABASE"
                    : event.private
                      ? "EVENTO PRIVADO"
                      : "REUNIÃO COM NOTAS"}
                </Text>
                <Text style={[styles.title, { color: tokens.foreground }]}>
                  {event.title}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar"
                onPress={onClose}
                style={[styles.close, { backgroundColor: tokens.muted }]}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={tokens.foreground}
                />
              </Pressable>
            </View>

            <View style={styles.details}>
              <DetailRow
                icon="calendar-clock-outline"
                text={formatCalendarEventRange(event, displayTimeZone)}
              />
              {event.location ? (
                <DetailRow icon="map-marker-outline" text={event.location} />
              ) : null}
              {event.status === "cancelled" ? (
                <View
                  style={[
                    styles.cancelled,
                    { backgroundColor: `${tokens.destructive}18` },
                  ]}
                >
                  <Text
                    style={[
                      styles.cancelledText,
                      { color: tokens.destructive },
                    ]}
                  >
                    Evento cancelado. As notas continuam disponíveis.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.actions}>
              {event.row_id ? (
                <ActionButton
                  icon="notebook-outline"
                  label="Abrir notas"
                  primary
                  onPress={() => {
                    onClose()
                    onOpenRow(event.row_id!)
                  }}
                />
              ) : null}
              {event.meet_url && isSafeExternalUrl(event.meet_url) ? (
                <ActionButton
                  icon="video-outline"
                  label="Google Meet"
                  onPress={() => void Linking.openURL(event.meet_url!)}
                />
              ) : null}
              {event.google_url && isSafeExternalUrl(event.google_url) ? (
                <ActionButton
                  icon="open-in-new"
                  label="Google Agenda"
                  onPress={() => void Linking.openURL(event.google_url!)}
                />
              ) : null}
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  )
}

function DetailRow({ icon, text }: { icon: string; text: string }) {
  const { tokens } = useAppTheme()
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons
        name={icon as never}
        size={19}
        color={tokens.mutedForeground}
      />
      <Text style={[styles.detailText, { color: tokens.mutedForeground }]}>
        {text}
      </Text>
    </View>
  )
}

function ActionButton({
  icon,
  label,
  primary = false,
  onPress,
}: {
  icon: string
  label: string
  primary?: boolean
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? tokens.primary : tokens.muted,
          borderColor: primary ? tokens.primary : tokens.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={18}
        color={primary ? tokens.primaryForeground : tokens.foreground}
      />
      <Text
        style={[
          styles.actionText,
          { color: primary ? tokens.primaryForeground : tokens.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function isSafeExternalUrl(value: string) {
  return /^https:\/\//i.test(value)
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },
  sheet: {
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  grabber: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titleGroup: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1 },
  title: { fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 27 },
  close: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  details: { gap: 12 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  cancelled: { padding: 12, borderRadius: 10 },
  cancelledText: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 11,
  },
  actionText: { fontFamily: fonts.sansSemibold, fontSize: 13 },
})
