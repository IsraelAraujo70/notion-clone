import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import { fonts, useAppTheme } from "@/lib/theme"

export function ScreenState({
  message,
  error = false,
}: {
  message: string
  error?: boolean
}) {
  const { tokens } = useAppTheme()
  return (
    <View style={[styles.container, { backgroundColor: tokens.background }]}>
      {!error && <ActivityIndicator color={tokens.ring} />}
      <Text
        style={[
          styles.message,
          { color: error ? tokens.destructive : tokens.mutedForeground },
        ]}
      >
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  message: { fontFamily: fonts.sans, fontSize: 15, textAlign: "center" },
})
