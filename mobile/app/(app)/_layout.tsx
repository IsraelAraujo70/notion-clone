import { Redirect, Stack } from "expo-router"
import { Platform } from "react-native"

import { ScreenState } from "@/components/ScreenState"
import { useAuth } from "@/lib/auth"
import { fonts, useAppTheme } from "@/lib/theme"

export default function AppLayout() {
  const { loading, token } = useAuth()
  const { mode, tokens } = useAppTheme()
  if (loading) return <ScreenState message="Sincronizando sua sessão..." />
  if (!token) return <Redirect href="/login" />

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerBackTitle: "",
        headerLargeTitle: false,
        headerShadowVisible: false,
        headerTransparent: Platform.OS === "ios",
        headerBlurEffect:
          Platform.OS === "ios"
            ? mode === "dark"
              ? "systemMaterialDark"
              : "systemMaterialLight"
            : undefined,
        headerStyle: {
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : tokens.background,
        },
        headerTintColor: tokens.foreground,
        headerTitleStyle: { fontFamily: fonts.sansSemibold, fontSize: 17 },
        contentStyle: { backgroundColor: tokens.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="appearance"
        options={{
          title: "Aparencia",
          presentation: Platform.OS === "ios" ? "formSheet" : "card",
          sheetAllowedDetents: Platform.OS === "ios" ? [0.7, 0.92] : undefined,
          sheetGrabberVisible: Platform.OS === "ios",
          headerTransparent: false,
          headerStyle: { backgroundColor: tokens.card },
        }}
      />
      <Stack.Screen
        name="workspaces/[workspaceId]"
        options={{ title: "Paginas" }}
      />
      <Stack.Screen
        name="workspaces/[workspaceId]/chat"
        options={{ title: "Reason" }}
      />
      <Stack.Screen
        name="workspaces/[workspaceId]/pages/[pageId]"
        options={{ title: "Pagina" }}
      />
    </Stack>
  )
}
