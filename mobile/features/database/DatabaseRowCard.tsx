import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { Block, JsonValue } from "@reason/core/contracts"
import {
  databaseRowStatus,
  type DatabaseProperty,
  type DatabaseStatus,
} from "@reason/core/database"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"

import { fonts, useAppTheme } from "@/lib/theme"

type Props = {
  row: Block
  properties: DatabaseProperty[]
  statuses: DatabaseStatus[]
  editable: boolean
  board?: boolean
  onOpen: () => void
  onDelete: () => void
  onCreateTagOptions: (propertyId: string, options: string[]) => void
  onUpdate: (
    properties: Record<string, JsonValue | null>,
    coalesceKey?: string
  ) => void
  onDragStart?: () => void
  onDragMove?: (absoluteX: number) => void
  onDragEnd?: (absoluteX: number) => void
  onDragCancel?: () => void
}

export type DatabaseRowCardHandle = { commit: () => boolean }

const STATUS_COLORS: Record<DatabaseStatus["color"], string> = {
  gray: "#8b8b8b",
  blue: "#2383e2",
  green: "#2e7d32",
  yellow: "#d29922",
  red: "#c83e3e",
  purple: "#9065b0",
}

export const DatabaseRowCard = forwardRef<DatabaseRowCardHandle, Props>(
  function DatabaseRowCard(
    {
      row,
      properties,
      statuses,
      editable,
      board = false,
      onOpen,
      onDelete,
      onCreateTagOptions,
      onUpdate,
      onDragStart,
      onDragMove,
      onDragEnd,
      onDragCancel,
    },
    ref
  ) {
    const { tokens } = useAppTheme()
    const inputRefs = useRef(new Map<string, BufferedInputHandle>())
    const draggingRef = useRef(false)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const visibleProperties = properties.filter(
      (property) => property.type !== "status"
    )

    function commitInputs() {
      let valid = true
      for (const input of inputRefs.current.values()) {
        if (!input.commit()) valid = false
      }
      return valid
    }

    useImperativeHandle(ref, () => ({ commit: commitInputs }))

    function openRow() {
      if (commitInputs()) onOpen()
    }

    const dragGesture = Gesture.Pan()
      .enabled(editable && board)
      .activateAfterLongPress(350)
      .runOnJS(true)
      .onStart(() => {
        if (!commitInputs()) return
        draggingRef.current = true
        onDragStart?.()
      })
      .onUpdate((event) => {
        if (!draggingRef.current) return
        setDragOffset({ x: event.translationX, y: event.translationY })
        onDragMove?.(event.absoluteX)
      })
      .onEnd((event) => {
        if (!draggingRef.current) return
        draggingRef.current = false
        onDragEnd?.(event.absoluteX)
        setDragOffset({ x: 0, y: 0 })
      })
      .onFinalize(() => {
        if (!draggingRef.current) return
        draggingRef.current = false
        onDragCancel?.()
        setDragOffset({ x: 0, y: 0 })
      })

    return (
      <GestureDetector gesture={dragGesture}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: tokens.background,
              borderColor: tokens.border,
              transform: [
                { translateX: dragOffset.x },
                { translateY: dragOffset.y },
              ],
            },
            draggingRef.current && styles.dragging,
          ]}
        >
          {visibleProperties.map((property) => (
            <PropertyField
              key={property.id}
              property={property}
              row={row}
              editable={editable}
              onOpen={property.type === "title" ? openRow : undefined}
              onCreateTagOptions={onCreateTagOptions}
              inputRef={(input) => {
                if (input) inputRefs.current.set(property.id, input)
                else inputRefs.current.delete(property.id)
              }}
              onChange={(value) =>
                onUpdate(
                  { [property.id]: value },
                  `database-row-property:${row.id}:${property.id}`
                )
              }
            />
          ))}

          {!board &&
          properties.some((property) => property.type === "status") &&
          statuses.length > 0 ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: tokens.mutedForeground }]}>
                STATUS
              </Text>
              <View style={styles.statuses}>
                {statuses.map((status) => {
                  const active =
                    databaseRowStatus(row.properties, statuses) === status.id
                  return (
                    <Pressable
                      key={status.id}
                      disabled={!editable || active}
                      onPress={() => onUpdate({ status: status.id })}
                      style={[
                        styles.status,
                        {
                          backgroundColor: active
                            ? tokens.accent
                            : tokens.muted,
                          borderColor: active ? tokens.ring : tokens.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: STATUS_COLORS[status.color] },
                        ]}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.statusText,
                          { color: tokens.foreground },
                        ]}
                      >
                        {status.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          {editable ? (
            <Pressable
              accessibilityLabel="Excluir linha"
              onPress={onDelete}
              style={styles.deleteButton}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={17}
                color={tokens.destructive}
              />
              <Text style={[styles.deleteText, { color: tokens.destructive }]}>
                Excluir
              </Text>
            </Pressable>
          ) : null}
        </View>
      </GestureDetector>
    )
  }
)

function PropertyField({
  property,
  row,
  editable,
  onOpen,
  onCreateTagOptions,
  inputRef,
  onChange,
}: {
  property: DatabaseProperty
  row: Block
  editable: boolean
  onOpen?: () => void
  onCreateTagOptions: (propertyId: string, options: string[]) => void
  inputRef: (input: BufferedInputHandle | null) => void
  onChange: (value: JsonValue | null) => void
}) {
  const { tokens } = useAppTheme()
  const value = row.properties[property.id]

  if (property.type === "checkbox") {
    return (
      <View style={[styles.field, styles.checkboxField]}>
        <Text style={[styles.label, { color: tokens.mutedForeground }]}>
          {property.name.toUpperCase()}
        </Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value === true }}
          disabled={!editable}
          onPress={() => onChange(value !== true)}
          style={[
            styles.checkbox,
            {
              borderColor: value === true ? tokens.primary : tokens.input,
              backgroundColor:
                value === true ? tokens.primary : tokens.background,
            },
          ]}
        >
          {value === true ? (
            <MaterialCommunityIcons
              name="check"
              size={15}
              color={tokens.primaryForeground}
            />
          ) : null}
        </Pressable>
      </View>
    )
  }

  const text = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .join(", ")
    : typeof value === "string" || typeof value === "number"
      ? String(value)
      : ""

  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={[styles.label, { color: tokens.mutedForeground }]}>
          {property.name.toUpperCase()}
        </Text>
        {onOpen ? (
          <Pressable
            accessibilityLabel="Abrir linha como pagina"
            onPress={onOpen}
            style={[styles.openButton, { backgroundColor: tokens.muted }]}
          >
            <MaterialCommunityIcons
              name="arrow-top-right"
              size={16}
              color={tokens.foreground}
            />
          </Pressable>
        ) : null}
      </View>
      <BufferedInput
        ref={inputRef}
        value={text}
        editable={editable}
        keyboardType={property.type === "number" ? "decimal-pad" : "default"}
        placeholder={
          property.type === "tags"
            ? "Separe tags por virgula"
            : property.type === "date"
              ? "AAAA-MM-DD"
              : property.type === "title"
                ? "Sem titulo"
                : "Vazio"
        }
        onCommit={(next) => {
          if (property.type === "tags") {
            const tags = Array.from(
              new Set(
                next
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              )
            )
            onCreateTagOptions(property.id, tags)
            onChange(tags)
            return true
          }
          if (property.type === "number") {
            if (next.trim() === "") onChange(null)
            else {
              const number = Number(next.replace(",", "."))
              if (!Number.isFinite(number)) return false
              onChange(number)
            }
            return true
          }
          if (property.type === "date" && next !== "" && !isIsoDate(next)) {
            return false
          }
          onChange(next === "" && property.type === "date" ? null : next)
          return true
        }}
      />
    </View>
  )
}

type BufferedInputHandle = { commit: () => boolean }

const BufferedInput = forwardRef<
  BufferedInputHandle,
  {
    value: string
    editable: boolean
    keyboardType: "default" | "decimal-pad"
    placeholder: string
    onCommit: (value: string) => boolean
  }
>(function BufferedInput(
  { value, editable, keyboardType, placeholder, onCommit },
  ref
) {
  const { tokens } = useAppTheme()
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (!editable) setDraft(value)
  }, [editable, value])

  function commitDraft() {
    if (!editable || draft === value) return true
    const accepted = onCommit(draft)
    if (!accepted) setDraft(value)
    return accepted
  }

  useImperativeHandle(ref, () => ({ commit: commitDraft }), [
    draft,
    editable,
    value,
    onCommit,
  ])

  return (
    <TextInput
      editable={editable}
      value={draft}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={tokens.mutedForeground}
      onChangeText={setDraft}
      onBlur={commitDraft}
      style={[
        styles.input,
        {
          color: tokens.foreground,
          backgroundColor: tokens.card,
          borderColor: tokens.input,
        },
      ]}
    />
  )
})

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 13,
    padding: 13,
    borderWidth: 1,
    borderRadius: 12,
  },
  dragging: { zIndex: 10, elevation: 10, opacity: 0.92 },
  field: { gap: 6 },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: fonts.sansSemibold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  input: {
    minHeight: 40,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 9,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  openButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  checkboxField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 6,
  },
  statuses: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  status: {
    maxWidth: 150,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 9,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 11 },
  deleteButton: {
    alignSelf: "flex-end",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
  },
  deleteText: { fontFamily: fonts.sansMedium, fontSize: 12 },
})
