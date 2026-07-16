import type { AiCitation, AiMessage } from "@reason/core/ai/contracts"
import * as Clipboard from "expo-clipboard"
import * as Haptics from "expo-haptics"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { ReasonMark } from "@/components/Brand"
import { MessageContent } from "@/features/chat/MessageContent"
import { fonts, useAppTheme } from "@/lib/theme"

export function ChatMessage({
  message,
  streaming = false,
  onCitation,
}: {
  message: AiMessage
  streaming?: boolean
  onCitation: (citation: AiCitation) => void
}) {
  const { tokens } = useAppTheme()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timeout)
  }, [copied])

  async function copy() {
    if (!message.content) return
    await Clipboard.setStringAsync(message.content)
    setCopied(true)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  if (message.role === "user") {
    return (
      <Pressable
        onLongPress={copy}
        style={[styles.userBubble, { backgroundColor: tokens.primary }]}
      >
        <Text style={[styles.userText, { color: tokens.primaryForeground }]}>
          {message.content}
        </Text>
      </Pressable>
    )
  }

  return (
    <Pressable onLongPress={copy} style={styles.assistantRow}>
      <View style={styles.mark}>
        <ReasonMark size={22} />
      </View>
      <View style={styles.assistantContent}>
        {copied ? (
          <Text style={[styles.copied, { color: tokens.success }]}>
            Copiado
          </Text>
        ) : null}
        <MessageContent content={message.content || " "} />
        {streaming ? (
          <View style={[styles.cursor, { backgroundColor: tokens.ring }]} />
        ) : null}
        {message.citations?.length ? (
          <View style={styles.citations}>
            {message.citations.map((citation) => (
              <Pressable
                key={`${citation.page_id}:${citation.block_id}`}
                onPress={() => onCitation(citation)}
                style={[
                  styles.citation,
                  { backgroundColor: tokens.muted, borderColor: tokens.border },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.citationText, { color: tokens.foreground }]}
                >
                  {citation.page_title}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  userBubble: {
    maxWidth: "86%",
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomRightRadius: 5,
  },
  userText: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  assistantRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  mark: { paddingTop: 2 },
  assistantContent: { flex: 1, minWidth: 0 },
  copied: { fontFamily: fonts.sansMedium, fontSize: 11, marginBottom: 4 },
  cursor: { width: 7, height: 7, borderRadius: 4, marginTop: -4 },
  citations: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  citation: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 9,
  },
  citationText: { fontFamily: fonts.sansMedium, fontSize: 11 },
})
