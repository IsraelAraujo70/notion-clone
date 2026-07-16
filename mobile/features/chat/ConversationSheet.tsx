import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { AiConversation } from "@reason/core/ai/contracts"
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { fonts, useAppTheme } from "@/lib/theme"

export function ConversationSheet({
  conversations,
  currentId,
  visible,
  onClose,
  onSelect,
}: {
  conversations: AiConversation[]
  currentId: string | null
  visible: boolean
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.sheet,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: tokens.input }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: tokens.foreground }]}>
              Conversas
            </Text>
            <Pressable
              accessibilityLabel="Fechar historico"
              onPress={onClose}
              style={[styles.close, { backgroundColor: tokens.muted }]}
            >
              <MaterialCommunityIcons
                name="close"
                size={19}
                color={tokens.foreground}
              />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {conversations.length === 0 ? (
              <Text style={[styles.empty, { color: tokens.mutedForeground }]}>
                Nenhuma conversa anterior.
              </Text>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === currentId
                return (
                  <Pressable
                    key={conversation.id}
                    onPress={() => {
                      onSelect(conversation.id)
                      onClose()
                    }}
                    style={[
                      styles.row,
                      {
                        backgroundColor: selected
                          ? tokens.accent
                          : tokens.background,
                        borderColor: selected ? tokens.ring : tokens.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={19}
                      color={tokens.mutedForeground}
                    />
                    <View style={styles.rowCopy}>
                      <Text
                        numberOfLines={1}
                        style={[styles.rowTitle, { color: tokens.foreground }]}
                      >
                        {conversation.title || "Nova conversa"}
                      </Text>
                      <Text
                        style={[
                          styles.rowDate,
                          { color: tokens.mutedForeground },
                        ]}
                      >
                        {new Date(conversation.updated_at).toLocaleDateString(
                          "pt-BR"
                        )}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={tokens.ring}
                      />
                    ) : null}
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheet: {
    maxHeight: "72%",
    paddingTop: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  grabber: { width: 38, height: 5, alignSelf: "center", borderRadius: 3 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 15,
    marginBottom: 14,
  },
  title: { fontFamily: fonts.heading, fontSize: 24 },
  close: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  list: { gap: 8, paddingBottom: 20 },
  empty: {
    paddingVertical: 40,
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: "center",
  },
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  rowCopy: { flex: 1 },
  rowTitle: { fontFamily: fonts.sansMedium, fontSize: 14 },
  rowDate: { fontFamily: fonts.sans, fontSize: 11, marginTop: 3 },
})
