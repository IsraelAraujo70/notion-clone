import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import {
  APP_THEMES,
  THEME_DEFINITIONS,
  fonts,
  useAppTheme,
  type ThemeMode,
} from "@/lib/theme"

export default function AppearanceScreen() {
  const { mode, setMode, setTheme, theme, tokens } = useAppTheme()
  const modes: ThemeMode[] = ["light", "dark"]

  return (
    <ScrollView
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.heading, { color: tokens.foreground }]}>
        Aparencia
      </Text>
      <Text style={[styles.description, { color: tokens.mutedForeground }]}>
        As mesmas paletas disponiveis no Reason web.
      </Text>

      <Text style={[styles.label, { color: tokens.foreground }]}>Modo</Text>
      <View style={styles.modeRow}>
        {modes.map((item) => (
          <Pressable
            key={item}
            onPress={() => setMode(item)}
            style={[
              styles.modeButton,
              { borderColor: mode === item ? tokens.ring : tokens.border },
              mode === item && { backgroundColor: tokens.accent },
            ]}
          >
            <Text style={[styles.modeText, { color: tokens.foreground }]}>
              {item === "light" ? "Claro" : "Escuro"}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: tokens.foreground }]}>Tema</Text>
      <View style={styles.grid}>
        {APP_THEMES.map((item) => {
          const definition = THEME_DEFINITIONS[item]
          const swatch = definition[mode]
          const active = item === theme
          return (
            <Pressable
              key={item}
              onPress={() => setTheme(item)}
              style={[
                styles.themeCard,
                {
                  backgroundColor: swatch.card,
                  borderColor: active ? tokens.ring : tokens.border,
                },
              ]}
            >
              <View style={styles.swatches}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch.background },
                  ]}
                />
                <View
                  style={[styles.swatch, { backgroundColor: swatch.primary }]}
                />
                <View
                  style={[styles.swatch, { backgroundColor: swatch.manila }]}
                />
              </View>
              <Text style={[styles.themeName, { color: swatch.foreground }]}>
                {definition.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  heading: { fontFamily: fonts.heading, fontSize: 30 },
  description: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  label: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    marginTop: 28,
    marginBottom: 10,
  },
  modeRow: { flexDirection: "row", gap: 10 },
  modeButton: {
    flex: 1,
    alignItems: "center",
    padding: 13,
    borderWidth: 1,
    borderRadius: 10,
  },
  modeText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeCard: {
    width: "48%",
    minHeight: 92,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  swatches: { flexDirection: "row", marginBottom: 13 },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: -4,
    borderWidth: 1,
    borderColor: "#00000018",
  },
  themeName: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
