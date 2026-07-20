import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import type { Block, JsonValue } from "@reason/core/contracts"
import {
  databaseProperties,
  databaseRowStatus,
  databaseStatuses,
  databaseView,
  type DatabaseProperty,
  type DatabaseStatus,
} from "@reason/core/database"
import { useEffect, useRef, useState } from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import {
  DatabaseRowCard,
  type DatabaseRowCardHandle,
} from "@/features/database/DatabaseRowCard"
import { DatabaseSettingsSheet } from "@/features/database/DatabaseSettingsSheet"
import { fonts, useAppTheme } from "@/lib/theme"

type Props = {
  block: Block
  rows: Block[]
  editable: boolean
  selected: boolean
  onLongPress: () => void
  onUpdateDatabase: (
    properties: Record<string, JsonValue | null>,
    coalesceKey?: string
  ) => void
  onAddRow: (status: string) => void
  onUpdateRow: (
    rowId: string,
    properties: Record<string, JsonValue | null>,
    coalesceKey?: string
  ) => void
  onDeleteRow: (rowId: string) => void
  onDeleteProperty: (
    propertyId: string,
    databasePatch: Record<string, JsonValue | null>
  ) => void
  onOpenRow: (rowId: string) => void
}

export function DatabaseBlock(props: Props) {
  const { tokens } = useAppTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const rowRefs = useRef(new Map<string, DatabaseRowCardHandle>())
  const properties = databaseProperties(props.block.properties)
  const statuses = databaseStatuses(props.block.properties)
  const view = databaseView(props.block.properties)
  const title =
    typeof props.block.properties.title === "string"
      ? props.block.properties.title
      : ""

  useEffect(() => {
    if (!props.editable) setSettingsOpen(false)
  }, [props.editable])

  function updateProperties(next: DatabaseProperty[], coalesceKey?: string) {
    props.onUpdateDatabase(
      { schema: serializeSchema(next) },
      coalesceKey ? `${coalesceKey}:${props.block.id}` : undefined
    )
  }

  function updateStatuses(next: DatabaseStatus[], coalesceKey?: string) {
    props.onUpdateDatabase(
      {
        statuses: next.map((status) => ({
          id: status.id,
          name: status.name,
          color: status.color,
        })),
      },
      coalesceKey ? `${coalesceKey}:${props.block.id}` : undefined
    )
  }

  function createTagOptions(propertyId: string, options: string[]) {
    const property = properties.find((item) => item.id === propertyId)
    if (!property || property.type !== "tags") return
    const nextOptions = Array.from(
      new Set([...(property.options ?? []), ...options])
    )
    if (nextOptions.length === (property.options ?? []).length) return
    updateProperties(
      properties.map((item) =>
        item.id === propertyId ? { ...item, options: nextOptions } : item
      )
    )
  }

  function changeView(view: "table" | "board") {
    for (const row of rowRefs.current.values()) {
      if (!row.commit()) return
    }
    props.onUpdateDatabase({ view })
  }

  function registerRow(rowId: string, row: DatabaseRowCardHandle | null) {
    if (row) rowRefs.current.set(rowId, row)
    else rowRefs.current.delete(rowId)
  }

  return (
    <View
      style={[
        styles.database,
        {
          backgroundColor: tokens.card,
          borderColor: props.selected ? tokens.ring : tokens.border,
        },
      ]}
    >
      <Pressable onLongPress={props.onLongPress} style={styles.header}>
        <TextInput
          editable={props.editable}
          value={title}
          placeholder="Base de dados sem título"
          placeholderTextColor={tokens.mutedForeground}
          onChangeText={(nextTitle) =>
            props.onUpdateDatabase(
              { title: nextTitle },
              `database-title:${props.block.id}`
            )
          }
          style={[styles.title, { color: tokens.foreground }]}
        />
        {props.editable ? (
          <Pressable
            accessibilityLabel="Configurar base de dados"
            onPress={() => setSettingsOpen(true)}
            style={[styles.settingsButton, { backgroundColor: tokens.muted }]}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={19}
              color={tokens.foreground}
            />
          </Pressable>
        ) : null}
      </Pressable>

      <View style={[styles.toolbar, { borderTopColor: tokens.border }]}>
        <View
          style={[
            styles.segmented,
            { backgroundColor: tokens.background, borderColor: tokens.border },
          ]}
        >
          <ViewButton
            icon="table-large"
            label="Tabela"
            active={view === "table"}
            disabled={!props.editable}
            onPress={() => changeView("table")}
          />
          <ViewButton
            icon="view-column-outline"
            label="Kanban"
            active={view === "board"}
            disabled={!props.editable}
            onPress={() => changeView("board")}
          />
        </View>
        <Text style={[styles.count, { color: tokens.mutedForeground }]}>
          {props.rows.length} {props.rows.length === 1 ? "item" : "itens"}
        </Text>
      </View>

      {view === "board" ? (
        <BoardView
          {...props}
          properties={properties}
          statuses={statuses}
          onCreateTagOptions={createTagOptions}
          registerRow={registerRow}
        />
      ) : (
        <TableView
          {...props}
          properties={properties}
          statuses={statuses}
          onCreateTagOptions={createTagOptions}
          registerRow={registerRow}
        />
      )}

      <DatabaseSettingsSheet
        visible={settingsOpen}
        properties={properties}
        statuses={statuses}
        onClose={() => setSettingsOpen(false)}
        onUpdateProperties={updateProperties}
        onDeleteProperty={(propertyId) => {
          const property = properties.find((item) => item.id === propertyId)
          const next = properties.filter((item) => item.id !== propertyId)
          props.onDeleteProperty(propertyId, {
            schema: serializeSchema(next),
            ...(property?.type === "status" && view === "board"
              ? { view: "table" }
              : {}),
          })
        }}
        onUpdateStatuses={updateStatuses}
      />
    </View>
  )
}

function TableView({
  rows,
  properties,
  statuses,
  editable,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onOpenRow,
  onCreateTagOptions,
  registerRow,
}: Props & {
  properties: DatabaseProperty[]
  statuses: DatabaseStatus[]
  onCreateTagOptions: (propertyId: string, options: string[]) => void
  registerRow: (rowId: string, row: DatabaseRowCardHandle | null) => void
}) {
  const { tokens } = useAppTheme()
  return (
    <View style={styles.table}>
      {rows.map((row) => (
        <DatabaseRowCard
          ref={(ref) => registerRow(row.id, ref)}
          key={row.id}
          row={row}
          properties={properties}
          statuses={statuses}
          editable={editable}
          onOpen={() => onOpenRow(row.id)}
          onDelete={() => onDeleteRow(row.id)}
          onCreateTagOptions={onCreateTagOptions}
          onUpdate={(patch, coalesceKey) =>
            onUpdateRow(row.id, patch, coalesceKey)
          }
        />
      ))}
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.mutedForeground }]}>
          Nenhuma linha ainda.
        </Text>
      ) : null}
      {editable ? (
        <AddButton
          label="Nova linha"
          onPress={() => onAddRow(statuses[0]!.id)}
        />
      ) : null}
    </View>
  )
}

function BoardView({
  rows,
  properties,
  statuses,
  editable,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onOpenRow,
  onCreateTagOptions,
  registerRow,
}: Props & {
  properties: DatabaseProperty[]
  statuses: DatabaseStatus[]
  onCreateTagOptions: (propertyId: string, options: string[]) => void
  registerRow: (rowId: string, row: DatabaseRowCardHandle | null) => void
}) {
  const { tokens } = useAppTheme()
  const columnRefs = useRef(new Map<string, View>())
  const columnBounds = useRef(
    new Map<string, { x: number; y: number; width: number; height: number }>()
  )
  const dragTargetRef = useRef<string | null>(null)
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<string | null>(null)

  function measureColumns() {
    columnBounds.current.clear()
    for (const [statusId, column] of columnRefs.current) {
      column.measureInWindow((x, y, width, height) => {
        columnBounds.current.set(statusId, { x, y, width, height })
      })
    }
  }

  function statusAt(absoluteX: number) {
    for (const [statusId, bounds] of columnBounds.current) {
      if (absoluteX >= bounds.x && absoluteX <= bounds.x + bounds.width) {
        return statusId
      }
    }
    return null
  }

  function startDrag(row: Block) {
    const currentStatus = databaseRowStatus(row.properties, statuses)
    measureColumns()
    dragTargetRef.current = currentStatus
    setDraggingRowId(row.id)
    setDragTarget(currentStatus)
  }

  function moveDrag(absoluteX: number) {
    const nextTarget = statusAt(absoluteX)
    if (!nextTarget || nextTarget === dragTargetRef.current) return
    dragTargetRef.current = nextTarget
    setDragTarget(nextTarget)
  }

  function finishDrag(row: Block, absoluteX: number) {
    const destination = statusAt(absoluteX) ?? dragTargetRef.current
    const currentStatus = databaseRowStatus(row.properties, statuses)
    if (destination && destination !== currentStatus) {
      onUpdateRow(row.id, { status: destination })
    }
    cancelDrag()
  }

  function cancelDrag() {
    dragTargetRef.current = null
    setDraggingRowId(null)
    setDragTarget(null)
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      scrollEnabled={!draggingRowId}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}
    >
      {statuses.map((status) => {
        const statusRows = rows.filter(
          (row) => databaseRowStatus(row.properties, statuses) === status.id
        )
        return (
          <View
            ref={(column) => {
              if (column) columnRefs.current.set(status.id, column)
              else columnRefs.current.delete(status.id)
            }}
            collapsable={false}
            key={status.id}
            style={[
              styles.column,
              {
                backgroundColor: tokens.muted,
                borderColor:
                  dragTarget === status.id ? tokens.ring : "transparent",
                zIndex: statusRows.some((row) => row.id === draggingRowId)
                  ? 2
                  : 0,
              },
            ]}
          >
            <View style={styles.columnHeader}>
              <Text
                numberOfLines={1}
                style={[styles.columnTitle, { color: tokens.foreground }]}
              >
                {status.name}
              </Text>
              <Text
                style={[styles.columnCount, { color: tokens.mutedForeground }]}
              >
                {statusRows.length}
              </Text>
            </View>
            <View style={styles.cards}>
              {statusRows.map((row) => (
                <DatabaseRowCard
                  ref={(ref) => registerRow(row.id, ref)}
                  key={row.id}
                  row={row}
                  properties={properties}
                  statuses={statuses}
                  editable={editable}
                  board
                  onOpen={() => onOpenRow(row.id)}
                  onDelete={() => onDeleteRow(row.id)}
                  onCreateTagOptions={onCreateTagOptions}
                  onUpdate={(patch, coalesceKey) =>
                    onUpdateRow(row.id, patch, coalesceKey)
                  }
                  onDragStart={() => startDrag(row)}
                  onDragMove={moveDrag}
                  onDragEnd={(absoluteX) => finishDrag(row, absoluteX)}
                  onDragCancel={cancelDrag}
                />
              ))}
            </View>
            {editable ? (
              <AddButton
                label="Novo card"
                onPress={() => onAddRow(status.id)}
              />
            ) : null}
          </View>
        )
      })}
    </ScrollView>
  )
}

function ViewButton({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: string
  label: string
  active: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      disabled={disabled || active}
      onPress={onPress}
      style={[styles.viewButton, active && { backgroundColor: tokens.accent }]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={17}
        color={tokens.foreground}
      />
      <Text style={[styles.viewLabel, { color: tokens.foreground }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.addButton,
        pressed && { backgroundColor: tokens.accent },
      ]}
    >
      <MaterialCommunityIcons
        name="plus"
        size={18}
        color={tokens.mutedForeground}
      />
      <Text style={[styles.addText, { color: tokens.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function serializeSchema(properties: DatabaseProperty[]) {
  return properties.map((property) => ({
    id: property.id,
    name: property.name,
    type: property.type,
    ...(property.width ? { width: property.width } : {}),
    ...(property.type === "tags"
      ? { options: [...(property.options ?? [])] }
      : {}),
  }))
}

const styles = StyleSheet.create({
  database: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 14,
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  title: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.headingBold,
    fontSize: 18,
  },
  settingsButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  toolbar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  segmented: {
    flexDirection: "row",
    padding: 3,
    borderWidth: 1,
    borderRadius: 10,
  },
  viewButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  viewLabel: { fontFamily: fonts.sansMedium, fontSize: 12 },
  count: { fontFamily: fonts.sans, fontSize: 11 },
  table: { gap: 10, padding: 12 },
  empty: {
    paddingVertical: 22,
    textAlign: "center",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  board: { alignItems: "flex-start", gap: 10, padding: 12 },
  column: {
    width: 276,
    gap: 9,
    padding: 9,
    borderWidth: 2,
    borderRadius: 12,
  },
  columnHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  columnTitle: {
    flex: 1,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  columnCount: { fontFamily: fonts.sansMedium, fontSize: 12 },
  cards: { gap: 8 },
  addButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderRadius: 9,
  },
  addText: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
