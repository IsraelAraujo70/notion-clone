import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { Block } from "@reason/core/contracts"
import { useEffect, useRef } from "react"
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"

import { MermaidBlock } from "@/features/editor/MermaidBlock"
import { fonts, useAppTheme } from "@/lib/theme"

export function EditorBlock({
  block,
  depth,
  editable,
  focusRequested,
  selected,
  onChangeText,
  onFocus,
  onLongPress,
  onSubmit,
  onToggle,
}: {
  block: Block
  depth: number
  editable: boolean
  focusRequested: boolean
  selected: boolean
  onChangeText: (text: string) => void
  onFocus: () => void
  onLongPress: () => void
  onSubmit: () => void
  onToggle: () => void
}) {
  const { tokens } = useAppTheme()
  const inputRef = useRef<TextInput>(null)
  const text = String(block.properties.text ?? block.properties.title ?? "")
  const left = Math.min(depth, 4) * 18
  const longPress = Gesture.LongPress()
    .minDuration(350)
    .runOnJS(true)
    .onStart(onLongPress)

  useEffect(() => {
    if (!focusRequested) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusRequested])

  if (block.type === "divider") {
    return (
      <GestureDetector gesture={longPress}>
        <Pressable
          style={[
            styles.dividerTouch,
            { marginLeft: left },
            selected && { backgroundColor: tokens.accent },
          ]}
        >
          <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        </Pressable>
      </GestureDetector>
    )
  }
  if (block.type === "image" && typeof block.properties.url === "string") {
    return (
      <GestureDetector gesture={longPress}>
        <Pressable
          style={[
            { marginLeft: left },
            selected && { backgroundColor: tokens.accent },
          ]}
        >
          <Image
            source={{ uri: block.properties.url }}
            style={[styles.image, { backgroundColor: tokens.muted }]}
          />
          {block.properties.caption ? (
            <Text style={[styles.caption, { color: tokens.mutedForeground }]}>
              {String(block.properties.caption)}
            </Text>
          ) : null}
        </Pressable>
      </GestureDetector>
    )
  }

  if (block.type === "page") {
    return (
      <GestureDetector gesture={longPress}>
        <Pressable
          style={[
            styles.pageLink,
            { marginLeft: left },
            selected && { backgroundColor: tokens.accent },
          ]}
        >
          <MaterialCommunityIcons
            name="file-document-outline"
            size={18}
            color={tokens.mutedForeground}
          />
          <Text style={[styles.pageLinkText, { color: tokens.foreground }]}>
            {text || "Sem titulo"}
          </Text>
        </Pressable>
      </GestureDetector>
    )
  }

  if (block.type === "mermaid") {
    return (
      <GestureDetector gesture={longPress}>
        <View style={{ marginLeft: left }}>
          <MermaidBlock
            editable={editable}
            focusRequested={focusRequested}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onLongPress={onLongPress}
            selected={selected}
            text={text}
          />
        </View>
      </GestureDetector>
    )
  }

  const prefix =
    block.type === "bulleted_list_item"
      ? "-"
      : block.type === "numbered_list_item"
        ? "1."
        : block.type === "toggle"
          ? ">"
          : null

  return (
    <GestureDetector gesture={longPress}>
      <Pressable
        style={[
          styles.row,
          { marginLeft: left },
          selected && { backgroundColor: tokens.accent },
          block.type === "callout" && { backgroundColor: tokens.muted },
          block.type === "quote" && {
            borderLeftWidth: 3,
            borderLeftColor: tokens.foreground,
            paddingLeft: 12,
          },
          block.type === "code" && { backgroundColor: tokens.muted },
        ]}
      >
        <Pressable
          accessibilityLabel="Opcoes do bloco"
          onPress={onLongPress}
          style={styles.handle}
        >
          <MaterialCommunityIcons
            name="drag-vertical"
            size={18}
            color={tokens.mutedForeground}
          />
        </Pressable>
        {block.type === "to_do" ? (
          <Pressable
            disabled={!editable}
            onPress={onToggle}
            style={[
              styles.checkbox,
              { borderColor: tokens.input },
              Boolean(block.properties.checked) && {
                backgroundColor: tokens.primary,
                borderColor: tokens.primary,
              },
            ]}
          >
            {block.properties.checked ? (
              <MaterialCommunityIcons
                name="check"
                size={13}
                color={tokens.primaryForeground}
              />
            ) : null}
          </Pressable>
        ) : null}
        {prefix ? (
          <Text style={[styles.prefix, { color: tokens.foreground }]}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={inputRef}
          editable={editable}
          multiline
          scrollEnabled={false}
          submitBehavior={block.type === "code" ? "newline" : "submit"}
          value={text}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onSubmitEditing={block.type === "code" ? undefined : onSubmit}
          placeholder="Digite algo..."
          placeholderTextColor={tokens.mutedForeground}
          style={[
            styles.text,
            { color: tokens.foreground },
            block.type === "heading1" && styles.heading1,
            block.type === "heading2" && styles.heading2,
            block.type === "heading3" && styles.heading3,
            block.type === "code" && styles.codeText,
          ]}
        />
      </Pressable>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    borderRadius: 8,
  },
  handle: {
    width: 24,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  text: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  prefix: { width: 24, fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  heading1: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 12,
  },
  heading2: {
    fontFamily: fonts.heading,
    fontSize: 23,
    lineHeight: 29,
    marginTop: 9,
  },
  heading3: {
    fontFamily: fonts.heading,
    fontSize: 19,
    lineHeight: 25,
    marginTop: 7,
  },
  codeText: {
    padding: 12,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 22,
  },
  checkbox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 4,
    marginTop: 3,
    marginRight: 8,
  },
  dividerTouch: { minHeight: 30, justifyContent: "center", borderRadius: 8 },
  divider: { height: 1 },
  image: { width: "100%", height: 220, borderRadius: 10 },
  caption: { marginTop: 6, fontFamily: fonts.sans, fontSize: 13 },
  pageLink: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageLinkText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    textDecorationLine: "underline",
  },
})
