import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import type { ToolActivity } from "./use-workspace-chat"
import { fonts, useAppTheme } from "@/lib/theme"

export function AgentActivityBar({
  activities,
  startedAt,
}: {
  activities: ToolActivity[]
  startedAt: number | null
}) {
  const { tokens } = useAppTheme()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    setElapsed(0)
    const interval = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    )
    return () => clearInterval(interval)
  }, [startedAt])

  if (!startedAt) return null
  const active = activities.find((item) => item.state === "running")

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.muted, borderColor: tokens.border },
      ]}
    >
      <ActivityIndicator size="small" color={tokens.ring} />
      <View style={styles.copy}>
        <Text style={[styles.label, { color: tokens.foreground }]}>
          {active?.label ?? "Reason esta pensando"}
        </Text>
        <Text style={[styles.detail, { color: tokens.mutedForeground }]}>
          Trabalhando ha {elapsed}s
        </Text>
      </View>
      <MaterialCommunityIcons name="creation" size={18} color={tokens.ring} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  copy: { flex: 1 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
  detail: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
})
