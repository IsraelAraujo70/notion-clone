import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { AiCitation, AiMessage } from "@reason/core/ai/contracts"
import { router, useLocalSearchParams, useNavigation } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { ReasonMark } from "@/components/Brand"
import { AgentActivityBar } from "@/features/chat/AgentActivityBar"
import { ChatComposer } from "@/features/chat/ChatComposer"
import { ChatMessage } from "@/features/chat/ChatMessage"
import { ConversationSheet } from "@/features/chat/ConversationSheet"
import { useWorkspaceChat } from "@/features/chat/use-workspace-chat"
import { useAuth } from "@/lib/auth"
import { fonts, useAppTheme } from "@/lib/theme"

const suggestions = [
  "Resuma os temas principais deste workspace",
  "Quais tarefas ainda estao pendentes?",
  "Encontre decisoes importantes nas minhas paginas",
]

export default function WorkspaceChatScreen() {
  const { workspaceId, contextPageId, role, name } = useLocalSearchParams<{
    workspaceId: string
    contextPageId: string
    role?: string
    name?: string
  }>()
  const navigation = useNavigation()
  const { token } = useAuth()
  const { tokens } = useAppTheme()
  const [historyOpen, setHistoryOpen] = useState(false)
  const listRef = useRef<FlatList<AiMessage>>(null)
  const nearEndRef = useRef(true)
  const chat = useWorkspaceChat({
    contextPageId,
    token: token ?? "",
    workspaceId,
  })

  useEffect(() => {
    navigation.setOptions({
      title: name ? `Reason em ${name}` : "Reason",
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Historico de conversas"
            onPress={() => setHistoryOpen(true)}
            style={[styles.headerButton, { backgroundColor: tokens.muted }]}
          >
            <MaterialCommunityIcons
              name="history"
              size={18}
              color={tokens.foreground}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Nova conversa"
            disabled={chat.busy}
            onPress={chat.newConversation}
            style={[styles.headerButton, { backgroundColor: tokens.muted }]}
          >
            <MaterialCommunityIcons
              name="square-edit-outline"
              size={18}
              color={tokens.foreground}
            />
          </Pressable>
        </View>
      ),
    })
  }, [chat.busy, name, navigation, tokens])

  const feed: AiMessage[] = chat.streamedText
    ? [
        ...chat.messages,
        {
          id: "streaming-assistant",
          role: "assistant",
          content: chat.streamedText,
          created_at: new Date().toISOString(),
        },
      ]
    : chat.messages

  useEffect(() => {
    if (!nearEndRef.current || feed.length === 0) return
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: chat.busy })
    })
    return () => cancelAnimationFrame(frame)
  }, [feed.length, chat.streamedText.length, chat.busy])

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    nearEndRef.current =
      contentSize.height - contentOffset.y - layoutMeasurement.height < 96
  }

  function openCitation(citation: AiCitation) {
    if (citation.workspace_id !== workspaceId) return
    router.push({
      pathname: "/(app)/workspaces/[workspaceId]/pages/[pageId]",
      params: { workspaceId, pageId: citation.page_id, role },
    })
  }

  if (!token) return null

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: tokens.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <FlatList
        ref={listRef}
        data={feed}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => (
          <ChatMessage
            message={item}
            streaming={item.id === "streaming-assistant"}
            onCitation={openCitation}
          />
        )}
        contentContainerStyle={[
          styles.feed,
          feed.length === 0 ? styles.emptyFeed : styles.filledFeed,
        ]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustsScrollIndicatorInsets={false}
        alwaysBounceVertical={false}
        bounces={false}
        overScrollMode="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        onContentSizeChange={() => {
          if (nearEndRef.current && feed.length > 0) {
            listRef.current?.scrollToEnd({ animated: false })
          }
        }}
        scrollEventThrottle={16}
        ListEmptyComponent={
          chat.loading ? (
            <ActivityIndicator color={tokens.ring} />
          ) : (
            <View style={styles.emptyState}>
              <ReasonMark size={42} />
              <Text style={[styles.emptyTitle, { color: tokens.foreground }]}>
                Converse com seu workspace
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: tokens.mutedForeground },
                ]}
              >
                O Reason pesquisa suas paginas e responde com fontes que voce
                pode abrir.
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => chat.setDraft(suggestion)}
                    style={[
                      styles.suggestion,
                      {
                        backgroundColor: tokens.card,
                        borderColor: tokens.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="arrow-up-left"
                      size={16}
                      color={tokens.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.suggestionText,
                        { color: tokens.foreground },
                      ]}
                    >
                      {suggestion}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )
        }
      />

      {chat.error || chat.status ? (
        <View
          style={[
            styles.status,
            {
              backgroundColor: tokens.muted,
              borderColor: chat.error ? tokens.destructive : tokens.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={chat.error ? "alert-circle-outline" : "information-outline"}
            size={17}
            color={chat.error ? tokens.destructive : tokens.mutedForeground}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: chat.error ? tokens.destructive : tokens.mutedForeground,
              },
            ]}
          >
            {chat.error ?? chat.status}
          </Text>
        </View>
      ) : null}

      <AgentActivityBar
        activities={chat.activities}
        startedAt={chat.startedAt}
      />
      <ChatComposer
        busy={chat.busy}
        draft={chat.draft}
        onChangeDraft={chat.setDraft}
        onSend={() => void chat.send()}
        onStop={chat.stop}
      />
      <ConversationSheet
        conversations={chat.conversations}
        currentId={chat.conversationId}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => void chat.selectConversation(id)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerActions: { flexDirection: "row", gap: 7 },
  headerButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  feed: { flexGrow: 1, gap: 22, paddingHorizontal: 18, paddingVertical: 18 },
  filledFeed: { justifyContent: "flex-end" },
  emptyFeed: { paddingTop: 64 },
  emptyState: { alignItems: "center", paddingHorizontal: 8 },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 27,
    textAlign: "center",
    marginTop: 18,
  },
  emptyDescription: {
    maxWidth: 320,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 7,
  },
  suggestions: { width: "100%", gap: 8, marginTop: 26 },
  suggestion: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 12,
  },
  suggestionText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  statusText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
})
