import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { Block, BlockType } from "@reason/core/contracts"
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

type BlockActionSheetProps = {
  block: Block | null
  visible: boolean
  canIndent: boolean
  canOutdent: boolean
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  onIndent: () => void
  onOutdent: () => void
  onTurnInto: (type: BlockType) => void
}

export function BlockActionSheet(props: BlockActionSheetProps) {
  const { tokens } = useAppTheme()
  const supportsTransform =
    props.block && !["page", "image", "divider"].includes(props.block.type)

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={props.onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.sheet,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: tokens.input }]} />
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: tokens.mutedForeground }]}>
                BLOCO
              </Text>
              <Text style={[styles.title, { color: tokens.foreground }]}>
                {props.block
                  ? (MOBILE_BLOCK_TYPES.find(
                      (item) => item.type === props.block?.type
                    )?.label ?? "Opcoes")
                  : "Opcoes"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar"
              onPress={props.onClose}
              style={[styles.closeButton, { backgroundColor: tokens.muted }]}
            >
              <MaterialCommunityIcons
                name="close"
                size={19}
                color={tokens.foreground}
              />
            </Pressable>
          </View>

          <View style={styles.actionGrid}>
            <ActionButton
              icon="content-duplicate"
              label="Duplicar"
              onPress={props.onDuplicate}
            />
            <ActionButton
              icon="format-indent-increase"
              label="Para dentro"
              disabled={!props.canIndent}
              onPress={props.onIndent}
            />
            <ActionButton
              icon="format-indent-decrease"
              label="Para fora"
              disabled={!props.canOutdent}
              onPress={props.onOutdent}
            />
          </View>

          {supportsTransform ? (
            <>
              <Text
                style={[styles.sectionLabel, { color: tokens.mutedForeground }]}
              >
                TRANSFORMAR EM
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeRow}>
                  {MOBILE_BLOCK_TYPES.map((item) => {
                    const active = item.type === props.block?.type
                    return (
                      <Pressable
                        key={item.type}
                        onPress={() => props.onTurnInto(item.type)}
                        style={[
                          styles.typeButton,
                          {
                            backgroundColor: active
                              ? tokens.accent
                              : tokens.muted,
                            borderColor: active ? tokens.ring : tokens.border,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={item.icon as never}
                          size={18}
                          color={tokens.foreground}
                        />
                        <Text
                          style={[
                            styles.typeLabel,
                            { color: tokens.foreground },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </ScrollView>
            </>
          ) : null}

          <Pressable
            onPress={props.onDelete}
            style={[styles.deleteButton, { borderColor: tokens.border }]}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={tokens.destructive}
            />
            <Text style={[styles.deleteText, { color: tokens.destructive }]}>
              Excluir bloco
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean
  icon: string
  label: string
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        { backgroundColor: tokens.muted },
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={21}
        color={tokens.foreground}
      />
      <Text style={[styles.actionLabel, { color: tokens.foreground }]}>
        {label}
      </Text>
    </Pressable>
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
    marginBottom: 18,
  },
  eyebrow: { fontFamily: fonts.sansSemibold, fontSize: 10, letterSpacing: 1.3 },
  title: { fontFamily: fonts.heading, fontSize: 22, marginTop: 2 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  actionGrid: { flexDirection: "row", gap: 9 },
  actionButton: {
    flex: 1,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
  },
  actionLabel: { fontFamily: fonts.sansMedium, fontSize: 12 },
  disabled: { opacity: 0.35 },
  sectionLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 22,
    marginBottom: 10,
  },
  typeRow: { flexDirection: "row", gap: 8 },
  typeButton: {
    minWidth: 82,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 11,
  },
  typeLabel: { fontFamily: fonts.sansMedium, fontSize: 11 },
  deleteButton: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 13,
  },
  deleteText: { fontFamily: fonts.sansSemibold, fontSize: 14 },
})
