import { Redirect } from "expo-router"

import { ScreenState } from "@/components/ScreenState"
import { useAuth } from "@/lib/auth"

export default function IndexScreen() {
  const { loading, token } = useAuth()
  if (loading) return <ScreenState message="Abrindo seu workspace..." />
  return <Redirect href={token ? "/(app)" : "/login"} />
}
