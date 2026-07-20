import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import {
  type DatabaseProperty,
  type DatabasePropertyType,
  type DatabaseStatus,
} from "@reason/core/database"
import { createId } from "@reason/core/id"
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { fonts, useAppTheme } from "@/lib/theme"

const PROPERTY_TYPES: Array<{
  type: DatabasePropertyType
  label: string
  icon: string
}> = [
  { type: "text", label: "Texto", icon: "format-text" },
  { type: "number", label: "Numero", icon: "numeric" },
  { type: "checkbox", label: "Checkbox", icon: "checkbox-marked-outline" },
  { type: "status", label: "Status", icon: "circle-slice-8" },
  { type: "tags", label: "Tags", icon: "tag-multiple-outline" },
  { type: "date", label: "Data", icon: "calendar-blank-outline" },
]

const STATUS_COLORS: DatabaseStatus["color"][] = [
  "gray",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
]

const COLOR_VALUES: Record<DatabaseStatus["color"], string> = {
  gray: "#8b8b8b",
  blue: "#2383e2",
  green: "#2e7d32",
  yellow: "#d29922",
  red: "#c83e3e",
  purple: "#9065b0",
}

type Props = {
  visible: boolean
  properties: DatabaseProperty[]
  statuses: DatabaseStatus[]
  onClose: () => void
  onUpdateProperties: (
    properties: DatabaseProperty[],
    coalesceKey?: string
  ) => void
  onDeleteProperty: (propertyId: string) => void
  onUpdateStatuses: (statuses: DatabaseStatus[], coalesceKey?: string) => void
}

export function DatabaseSettingsSheet(props: Props) {
  const { tokens } = useAppTheme()
  const hasStatus = props.properties.some(
    (property) => property.type === "status"
  )

  function addProperty(type: DatabasePropertyType) {
    if (type === "status" && hasStatus) return
    props.onUpdateProperties([
      ...props.properties,
      {
        id: type === "status" ? "status" : createId(),
        name: propertyLabel(type),
        type,
        ...(type === "tags" ? { options: [] } : {}),
      },
    ])
  }

  function moveProperty(index: number, direction: -1 | 1) {
    const target = index + direction
    if (index < 1 || target < 1 || target >= props.properties.length) return
    const next = [...props.properties]
    const [property] = next.splice(index, 1)
    next.splice(target, 0, property!)
    props.onUpdateProperties(next)
  }

  function moveStatus(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= props.statuses.length) return
    const next = [...props.statuses]
    const [status] = next.splice(index, 1)
    next.splice(target, 0, status!)
    props.onUpdateStatuses(next)
  }

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
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
                DATABASE
              </Text>
              <Text style={[styles.title, { color: tokens.foreground }]}>
                Estrutura
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar configuracoes"
              onPress={props.onClose}
              style={[styles.closeButton, { backgroundColor: tokens.muted }]}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={tokens.foreground}
              />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <SectionLabel>PROPRIEDADES</SectionLabel>
            <View style={styles.list}>
              {props.properties.map((property, index) => (
                <View
                  key={property.id}
                  style={[
                    styles.row,
                    {
                      backgroundColor: tokens.background,
                      borderColor: tokens.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={propertyIcon(property.type) as never}
                    size={19}
                    color={tokens.mutedForeground}
                  />
                  <TextInput
                    value={property.name}
                    onChangeText={(name) =>
                      props.onUpdateProperties(
                        props.properties.map((item) =>
                          item.id === property.id ? { ...item, name } : item
                        ),
                        `database-property-name:${property.id}`
                      )
                    }
                    style={[styles.nameInput, { color: tokens.foreground }]}
                  />
                  {property.type !== "title" ? (
                    <>
                      <SmallButton
                        icon="chevron-up"
                        disabled={index <= 1}
                        onPress={() => moveProperty(index, -1)}
                      />
                      <SmallButton
                        icon="chevron-down"
                        disabled={index === props.properties.length - 1}
                        onPress={() => moveProperty(index, 1)}
                      />
                      <SmallButton
                        icon="trash-can-outline"
                        destructive
                        onPress={() => props.onDeleteProperty(property.id)}
                      />
                    </>
                  ) : null}
                </View>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.addRow}
            >
              {PROPERTY_TYPES.map((item) => {
                const disabled = item.type === "status" && hasStatus
                return (
                  <Pressable
                    key={item.type}
                    disabled={disabled}
                    onPress={() => addProperty(item.type)}
                    style={[
                      styles.addButton,
                      {
                        backgroundColor: tokens.muted,
                        borderColor: tokens.border,
                      },
                      disabled && styles.disabled,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as never}
                      size={18}
                      color={tokens.foreground}
                    />
                    <Text
                      style={[styles.addLabel, { color: tokens.foreground }]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            {hasStatus ? (
              <>
                <SectionLabel>STATUS</SectionLabel>
                <View style={styles.list}>
                  {props.statuses.map((status, index) => (
                    <View
                      key={status.id}
                      style={[
                        styles.row,
                        {
                          backgroundColor: tokens.background,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityLabel={`Mudar cor de ${status.name}`}
                        onPress={() => {
                          const colorIndex = STATUS_COLORS.indexOf(status.color)
                          const color =
                            STATUS_COLORS[
                              (colorIndex + 1) % STATUS_COLORS.length
                            ]!
                          props.onUpdateStatuses(
                            props.statuses.map((item) =>
                              item.id === status.id ? { ...item, color } : item
                            )
                          )
                        }}
                        style={[
                          styles.colorButton,
                          { backgroundColor: COLOR_VALUES[status.color] },
                        ]}
                      />
                      <TextInput
                        value={status.name}
                        onChangeText={(name) =>
                          props.onUpdateStatuses(
                            props.statuses.map((item) =>
                              item.id === status.id ? { ...item, name } : item
                            ),
                            `database-status-name:${status.id}`
                          )
                        }
                        style={[styles.nameInput, { color: tokens.foreground }]}
                      />
                      <SmallButton
                        icon="chevron-up"
                        disabled={index === 0}
                        onPress={() => moveStatus(index, -1)}
                      />
                      <SmallButton
                        icon="chevron-down"
                        disabled={index === props.statuses.length - 1}
                        onPress={() => moveStatus(index, 1)}
                      />
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={() =>
                    props.onUpdateStatuses([
                      ...props.statuses,
                      {
                        id: createId(),
                        name: `Status ${props.statuses.length + 1}`,
                        color:
                          STATUS_COLORS[
                            props.statuses.length % STATUS_COLORS.length
                          ]!,
                      },
                    ])
                  }
                  style={[styles.newStatus, { backgroundColor: tokens.muted }]}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={18}
                    color={tokens.foreground}
                  />
                  <Text
                    style={[styles.newStatusText, { color: tokens.foreground }]}
                  >
                    Novo status
                  </Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

function SectionLabel({ children }: { children: string }) {
  const { tokens } = useAppTheme()
  return (
    <Text style={[styles.sectionLabel, { color: tokens.mutedForeground }]}>
      {children}
    </Text>
  )
}

function SmallButton({
  icon,
  disabled,
  destructive,
  onPress,
}: {
  icon: string
  disabled?: boolean
  destructive?: boolean
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.smallButton, disabled && styles.disabled]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={18}
        color={destructive ? tokens.destructive : tokens.mutedForeground}
      />
    </Pressable>
  )
}

function propertyLabel(type: DatabasePropertyType) {
  return (
    PROPERTY_TYPES.find((item) => item.type === type)?.label ?? "Propriedade"
  )
}

function propertyIcon(type: DatabasePropertyType) {
  if (type === "title") return "format-title"
  return (
    PROPERTY_TYPES.find((item) => item.type === type)?.icon ?? "format-text"
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    maxHeight: "88%",
    paddingTop: 9,
    paddingHorizontal: 18,
    paddingBottom: 8,
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
    marginTop: 14,
    marginBottom: 10,
  },
  eyebrow: { fontFamily: fonts.sansSemibold, fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: fonts.heading, fontSize: 23, marginTop: 2 },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  sectionLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 10,
    letterSpacing: 1.1,
    marginTop: 18,
    marginBottom: 9,
  },
  list: { gap: 7 },
  row: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  smallButton: {
    width: 30,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  colorButton: { width: 18, height: 18, borderRadius: 9 },
  addRow: { gap: 8, paddingVertical: 10 },
  addButton: {
    minWidth: 82,
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  addLabel: { fontFamily: fonts.sansMedium, fontSize: 11 },
  disabled: { opacity: 0.35 },
  newStatus: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 9,
    marginBottom: 24,
    borderRadius: 11,
  },
  newStatusText: { fontFamily: fonts.sansSemibold, fontSize: 13 },
})
