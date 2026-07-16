import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import {
  router,
  useLocalSearchParams,
  useNavigation,
  type Href,
} from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { ScreenState } from "@/components/ScreenState"
import { api, type PageListResponse } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { readCache, writeCache } from "@/lib/cache"
import { fonts, useAppTheme } from "@/lib/theme"

export default function PagesScreen() {
  const { workspaceId, name, role } = useLocalSearchParams<{
    workspaceId: string
    name?: string
    role?: string
  }>()
  const navigation = useNavigation()
  const { token } = useAuth()
  const { tokens } = useAppTheme()
  const [data, setData] = useState<PageListResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    navigation.setOptions({
      title: name ?? "Paginas",
      headerRight: data
        ? () => (
            <Pressable
              accessibilityLabel="Conversar com o Reason"
              onPress={() =>
                router.push({
                  pathname: "/(app)/workspaces/[workspaceId]/chat",
                  params: {
                    workspaceId,
                    contextPageId: data.pages[0]?.id ?? data.root_page_id,
                    role,
                    name,
                  },
                } as Href)
              }
              style={[styles.chatButton, { backgroundColor: tokens.muted }]}
            >
              <MaterialCommunityIcons
                name="creation"
                size={19}
                color={tokens.ring}
              />
            </Pressable>
          )
        : undefined,
    })
  }, [data, name, navigation, role, tokens, workspaceId])

  useEffect(() => {
    if (!token || !workspaceId) return
    let active = true
    const key = `pages:${workspaceId}`
    readCache<PageListResponse>(key).then((cached) => {
      if (active && cached) setData(cached)
      api.listPages(token, workspaceId).then(
        (remote) => {
          if (!active) return
          setData(remote)
          writeCache(key, remote)
        },
        () => {
          if (active) setError("Sem conexao. Estas sao as paginas salvas.")
        }
      )
    })
    return () => {
      active = false
    }
  }, [token, workspaceId])

  if (!data) {
    return error ? (
      <ScreenState message={error} error />
    ) : (
      <ScreenState message="Abrindo paginas..." />
    )
  }

  const parents = new Map(
    data.pages.map((page) => [page.id, page.parent_page_id])
  )
  const depthOf = (id: string) => {
    let depth = 0
    let parent = parents.get(id)
    const seen = new Set<string>()
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      depth += 1
      parent = parents.get(parent)
    }
    return depth
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {error ? (
        <Text style={[styles.notice, { color: tokens.mutedForeground }]}>
          {error}
        </Text>
      ) : null}
      {data.pages.map((page) => {
        const depth = depthOf(page.id)
        return (
          <Pressable
            key={page.id}
            onPress={() =>
              router.push({
                pathname: "/(app)/workspaces/[workspaceId]/pages/[pageId]",
                params: { workspaceId, pageId: page.id, role },
              })
            }
            style={({ pressed }) => [
              styles.row,
              { paddingLeft: 14 + Math.min(depth, 4) * 20 },
              { borderBottomColor: tokens.border },
              pressed && { backgroundColor: tokens.muted },
            ]}
          >
            <View
              style={[
                styles.rail,
                { backgroundColor: depth > 0 ? tokens.ring : tokens.manila },
              ]}
            />
            <Text style={[styles.icon, { color: tokens.foreground }]}>
              {page.icon || "#"}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: tokens.foreground }]}
            >
              {page.title || "Sem titulo"}
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={tokens.mutedForeground}
            />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 48 },
  notice: { fontFamily: fonts.sans, fontSize: 13, marginBottom: 12 },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
  },
  rail: { width: 3, height: 28, borderRadius: 2 },
  icon: {
    width: 26,
    fontFamily: fonts.sans,
    fontSize: 18,
    textAlign: "center",
  },
  title: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16 },
  chatButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
})
