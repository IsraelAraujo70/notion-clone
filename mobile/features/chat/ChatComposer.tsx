import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { Pressable, StyleSheet, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { fonts, useAppTheme } from "@/lib/theme"

export function ChatComposer({
  busy,
  draft,
  onChangeDraft,
  onSend,
  onStop,
}: {
  busy: boolean
  draft: string
  onChangeDraft: (draft: string) => void
  onSend: () => void
  onStop: () => void
}) {
  const { tokens } = useAppTheme()
  const insets = useSafeAreaInsets()
  const canSend = draft.trim().length > 0 && !busy

  return (
    <View
      style={[
        styles.host,
        {
          backgroundColor: tokens.background,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View
        style={[
          styles.composer,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <TextInput
          accessibilityLabel="Mensagem para o Reason"
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Pergunte sobre este workspace..."
          placeholderTextColor={tokens.mutedForeground}
          style={[styles.input, { color: tokens.foreground }]}
        />
        <Pressable
          accessibilityLabel={busy ? "Parar resposta" : "Enviar mensagem"}
          disabled={!busy && !canSend}
          onPress={busy ? onStop : onSend}
          style={[
            styles.action,
            {
              backgroundColor: busy
                ? tokens.destructive
                : canSend
                  ? tokens.primary
                  : tokens.muted,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={busy ? "stop" : "arrow-up"}
            size={20}
            color={
              busy || canSend
                ? tokens.primaryForeground
                : tokens.mutedForeground
            }
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 12, paddingTop: 4 },
  composer: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 7,
    paddingLeft: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 7,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
  },
  action: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
})
