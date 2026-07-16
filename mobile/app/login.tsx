import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { Redirect, router } from "expo-router"
import { useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { Brand } from "@/components/Brand"
import { useAuth } from "@/lib/auth"
import { fonts, useAppTheme } from "@/lib/theme"

export default function LoginScreen() {
  const { token, login } = useAuth()
  const { mode, setMode, tokens } = useAppTheme()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (token) return <Redirect href="/(app)" />

  async function submit() {
    setSubmitting(true)
    setError("")
    try {
      await login(email.trim(), password)
      router.replace("/(app)")
    } catch {
      setError("Email ou senha incorretos.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: tokens.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Pressable
        accessibilityLabel="Alternar tema"
        onPress={() => setMode(mode === "dark" ? "light" : "dark")}
        style={[styles.themeButton, { backgroundColor: tokens.muted }]}
      >
        <MaterialCommunityIcons
          name={mode === "dark" ? "weather-sunny" : "weather-night"}
          size={19}
          color={tokens.foreground}
        />
      </Pressable>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Brand />
        <View
          style={[
            styles.card,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Text style={[styles.title, { color: tokens.foreground }]}>
            Bem-vindo de volta
          </Text>
          <Text style={[styles.subtitle, { color: tokens.mutedForeground }]}>
            Entre para acessar seu workspace.
          </Text>

          {error ? (
            <View
              style={[
                styles.alert,
                {
                  borderColor: tokens.destructive,
                  backgroundColor: tokens.background,
                },
              ]}
            >
              <Text style={[styles.alertText, { color: tokens.destructive }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={[styles.label, { color: tokens.foreground }]}>
              Email
            </Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={[
                styles.input,
                {
                  color: tokens.foreground,
                  backgroundColor: tokens.background,
                  borderColor: tokens.input,
                },
              ]}
              placeholderTextColor={tokens.mutedForeground}
            />
            <Text style={[styles.label, { color: tokens.foreground }]}>
              Senha
            </Text>
            <TextInput
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              style={[
                styles.input,
                {
                  color: tokens.foreground,
                  backgroundColor: tokens.background,
                  borderColor: tokens.input,
                },
              ]}
              placeholderTextColor={tokens.mutedForeground}
            />
            <Pressable
              accessibilityRole="button"
              disabled={submitting || !email || !password}
              onPress={submit}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: tokens.primary },
                pressed && styles.buttonPressed,
                (submitting || !email || !password) && styles.buttonDisabled,
              ]}
            >
              <Text
                style={[styles.buttonText, { color: tokens.primaryForeground }]}
              >
                {submitting ? "Entrando..." : "Entrar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    padding: 24,
  },
  themeButton: {
    position: "absolute",
    zIndex: 1,
    top: 58,
    right: 20,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
  },
  title: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 31 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, marginTop: 5 },
  alert: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 20 },
  alertText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  form: { gap: 8, marginTop: 24 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, marginTop: 7 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  button: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    borderRadius: 10,
  },
  buttonPressed: { transform: [{ translateY: 1 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.sansSemibold, fontSize: 14 },
})
