import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { router, type Href } from "expo-router"
import { useEffect, useState } from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Brand } from "@/components/Brand"
import { ScreenState } from "@/components/ScreenState"
import { api, type Workspace, type WorkspaceRole } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { readCache, writeCache } from "@/lib/cache"
import { fonts, useAppTheme } from "@/lib/theme"

const CACHE_KEY = "workspaces"

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Proprietario",
  editor: "Editor",
  viewer: "Leitor",
}

export default function WorkspacesScreen() {
  const { token, user, logout } = useAuth()
  const { tokens } = useAppTheme()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  async function load(showRefresh = false) {
    if (!token) return
    if (showRefresh) setRefreshing(true)
    setError("")
    try {
      const remote = await api.listWorkspaces(token)
      setWorkspaces(remote)
      await writeCache(CACHE_KEY, remote)
    } catch {
      setError("Nao foi possivel atualizar. Exibindo o que esta salvo.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true
    readCache<Workspace[]>(CACHE_KEY).then((cached) => {
      if (active && cached) setWorkspaces(cached)
      if (active) load()
    })
    return () => {
      active = false
    }
  }, [token])

  if (loading && workspaces.length === 0) {
    return <ScreenState message="Buscando seus workspaces..." />
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: tokens.background }]}
    >
      <View style={styles.shell}>
        <View style={styles.topbar}>
          <Brand />
          <Pressable
            accessibilityLabel="Aparencia"
            onPress={() => router.push("/(app)/appearance" as Href)}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: pressed ? tokens.accent : tokens.muted,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="palette-outline"
              size={20}
              color={tokens.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: tokens.mutedForeground }]}>
            WORKSPACES
          </Text>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            Continue pensando, {user?.display_name.split(" ")[0]}.
          </Text>
          {error ? (
            <View style={[styles.notice, { backgroundColor: tokens.muted }]}>
              <MaterialCommunityIcons
                name="cloud-alert-outline"
                size={17}
                color={tokens.mutedForeground}
              />
              <Text
                style={[styles.noticeText, { color: tokens.mutedForeground }]}
              >
                {error}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.workspaceScroll}
          contentContainerStyle={[
            styles.workspaceList,
            workspaces.length === 0 && styles.emptyList,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={tokens.primary}
              onRefresh={() => load(true)}
            />
          }
        >
          {workspaces.length === 0 ? (
            <View style={styles.emptyState}>
              <View
                style={[styles.emptyIcon, { backgroundColor: tokens.muted }]}
              >
                <MaterialCommunityIcons
                  name="view-grid-plus-outline"
                  size={24}
                  color={tokens.mutedForeground}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: tokens.foreground }]}>
                Nenhum workspace
              </Text>
              <Text
                style={[styles.emptyText, { color: tokens.mutedForeground }]}
              >
                Crie seu primeiro workspace na versao web.
              </Text>
            </View>
          ) : (
            workspaces.map((workspace) => (
              <Pressable
                key={workspace.id}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${workspace.name}`}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/workspaces/[workspaceId]",
                    params: {
                      workspaceId: workspace.id,
                      name: workspace.name,
                      role: workspace.role,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: pressed ? tokens.muted : tokens.card,
                    borderColor: pressed ? tokens.ring : tokens.border,
                  },
                  pressed && styles.cardPressed,
                ]}
              >
                <View
                  style={[
                    styles.workspaceMark,
                    { backgroundColor: tokens.sidebarAccent },
                  ]}
                >
                  <Text
                    style={[
                      styles.workspaceLetter,
                      { color: tokens.foreground },
                    ]}
                  >
                    {workspace.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.cardTitle, { color: tokens.foreground }]}
                  >
                    {workspace.name}
                  </Text>
                  <Text
                    style={[styles.cardMeta, { color: tokens.mutedForeground }]}
                  >
                    {roleLabels[workspace.role]}
                  </Text>
                </View>
                <View
                  style={[
                    styles.chevron,
                    { backgroundColor: tokens.sidebarAccent },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={19}
                    color={tokens.mutedForeground}
                  />
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>

        <View
          style={[
            styles.accountBar,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <View
            style={[styles.avatar, { backgroundColor: tokens.sidebarAccent }]}
          >
            <Text style={[styles.avatarText, { color: tokens.foreground }]}>
              {user?.display_name.slice(0, 1).toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={styles.accountText}>
            <Text
              numberOfLines={1}
              style={[styles.accountName, { color: tokens.foreground }]}
            >
              {user?.display_name}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.accountEmail, { color: tokens.mutedForeground }]}
            >
              {user?.email}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Sair desta conta"
            accessibilityRole="button"
            onPress={logout}
            style={({ pressed }) => [
              styles.logoutButton,
              { backgroundColor: pressed ? tokens.accent : tokens.muted },
            ]}
          >
            <MaterialCommunityIcons
              name="logout"
              size={20}
              color={tokens.foreground}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  shell: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  intro: { marginTop: 32, marginBottom: 20 },
  eyebrow: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  title: {
    maxWidth: 310,
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 8,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  workspaceScroll: { flex: 1 },
  workspaceList: { gap: 9, paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  emptyState: { alignItems: "center", paddingHorizontal: 24 },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 20, marginTop: 14 },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 5,
  },
  card: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  cardPressed: { transform: [{ scale: 0.99 }] },
  workspaceMark: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  workspaceLetter: { fontFamily: fonts.sansSemibold, fontSize: 15 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.sansSemibold, fontSize: 16 },
  cardMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chevron: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  accountBar: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 11,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 6,
  },
  avatar: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  avatarText: { fontFamily: fonts.sansSemibold, fontSize: 14 },
  accountText: { flex: 1, minWidth: 0 },
  accountName: { fontFamily: fonts.sansSemibold, fontSize: 14 },
  accountEmail: { fontFamily: fonts.sans, fontSize: 11, marginTop: 3 },
  logoutButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
})
