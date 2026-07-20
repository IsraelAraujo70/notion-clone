import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { BlockType } from "@reason/core/contracts"
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MOBILE_BLOCK_TYPES } from "@/features/editor/block-operations"
import { fonts, useAppTheme } from "@/lib/theme"

const INSERT_BLOCK_TYPES = [
  ...MOBILE_BLOCK_TYPES,
  { type: "database", label: "Base de dados", icon: "table-large" },
] satisfies Array<{ type: BlockType; label: string; icon: string }>

export function BlockInsertSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  onSelect: (type: BlockType) => void
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
              Novo bloco
            </Text>
            <Pressable
              accessibilityLabel="Fechar"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: tokens.muted }]}
            >
              <MaterialCommunityIcons
                name="close"
                size={19}
                color={tokens.foreground}
              />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.options}>
            {INSERT_BLOCK_TYPES.map((item) => (
              <Pressable
                key={item.type}
                onPress={() => onSelect(item.type)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: pressed ? tokens.accent : tokens.card,
                    borderColor: tokens.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon as never}
                  size={20}
                  color={tokens.foreground}
                />
                <Text style={[styles.label, { color: tokens.foreground }]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
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
    maxHeight: "78%",
    paddingTop: 9,
    paddingHorizontal: 18,
    paddingBottom: 10,
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
  title: { fontFamily: fonts.heading, fontSize: 22 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  options: { gap: 7, paddingBottom: 8 },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 11,
  },
  label: { fontFamily: fonts.sansMedium, fontSize: 15 },
})
