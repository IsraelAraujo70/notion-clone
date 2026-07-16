import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold"
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold"
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular"
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium"
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular"
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium"
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold"
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { AuthProvider } from "@/lib/auth"
import { ThemeProvider, useAppTheme } from "@/lib/theme"

export default function RootLayout() {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })
  if (!loaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStack />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

function ThemedStack() {
  const { mode, tokens } = useAppTheme()
  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: tokens.background },
          headerShadowVisible: false,
          headerTintColor: tokens.foreground,
          contentStyle: { backgroundColor: tokens.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
