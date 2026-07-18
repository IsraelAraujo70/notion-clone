"use client"

import type { Block, JsonValue } from "@reason/core/contracts"
import {
  databaseProperties,
  databaseStatuses,
  databaseView,
  type DatabaseProperty,
  type DatabasePropertyType,
  type DatabaseStatus,
} from "@reason/core/database"
import { createId } from "@reason/core/id"
import { Columns3Icon, Table2Icon } from "lucide-react"

import { DatabaseBoard } from "@/components/database/molecules/database-board"
import { DatabaseTable } from "@/components/database/molecules/database-table"
import {
  NewDatabasePropertyMenu,
  propertyTypeName,
} from "@/components/database/molecules/new-database-property-menu"
import { useI18n } from "@/lib/i18n/i18n-provider"

interface DatabaseBlockProps {
  block: Block
  rows: Block[]
  readOnly: boolean
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
  onOpenRow?: (rowId: string) => void
  onCommit: () => void
}

const STATUS_COLORS: DatabaseStatus["color"][] = [
  "gray",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
]

export function DatabaseBlock({
  block,
  rows,
  readOnly,
  onUpdateDatabase,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onDeleteProperty,
  onOpenRow,
  onCommit,
}: DatabaseBlockProps) {
  const { t } = useI18n()
  const statuses = databaseStatuses(block.properties)
  const properties = databaseProperties(block.properties)
  const hasStatus = properties.some((property) => property.type === "status")
  const view = databaseView(block.properties)
  const title = propertyText(block, "title")
  const databaseRows = rows.filter((row) => row.type === "database_row")

  const updateSchema = (next: DatabaseProperty[], coalesceKey?: string) => {
    const patch = { schema: serializeSchema(next) }
    if (coalesceKey) onUpdateDatabase(patch, coalesceKey)
    else onUpdateDatabase(patch)
  }

  const updateStatuses = (next: DatabaseStatus[], coalesceKey?: string) => {
    const patch = {
      statuses: next.map((status) => ({
        id: status.id,
        name: status.name,
        color: status.color,
      })),
    }
    if (coalesceKey) onUpdateDatabase(patch, coalesceKey)
    else onUpdateDatabase(patch)
  }

  const addStatus = () =>
    updateStatuses([
      ...statuses,
      {
        id: createId(),
        name: `${t("Status")} ${statuses.length + 1}`,
        color: STATUS_COLORS[statuses.length % STATUS_COLORS.length]!,
      },
    ])

  const addProperty = (type: DatabasePropertyType) => {
    if (
      (type === "title" || type === "status") &&
      properties.some((property) => property.type === type)
    )
      return
    updateSchema([
      ...properties,
      {
        id: type === "status" ? "status" : createId(),
        name: propertyTypeName(type, t),
        type,
        ...(type === "tags" ? { options: [] } : {}),
      },
    ])
  }

  const moveProperty = (propertyId: string, direction: -1 | 1) => {
    const index = properties.findIndex((property) => property.id === propertyId)
    if (index < 1) return
    const target = index + direction
    if (target < 1 || target >= properties.length) return
    const next = [...properties]
    const [property] = next.splice(index, 1)
    next.splice(target, 0, property!)
    updateSchema(next)
  }

  const deleteProperty = (propertyId: string) => {
    const property = properties.find((item) => item.id === propertyId)
    if (!property || property.type === "title") return
    onDeleteProperty(propertyId, {
      schema: serializeSchema(
        properties.filter((item) => item.id !== propertyId)
      ),
      ...(property.type === "status" && view === "board"
        ? { view: "table" }
        : {}),
    })
  }

  const createTagOption = (propertyId: string, option: string) =>
    updateSchema(
      properties.map((property) =>
        property.id === propertyId && property.type === "tags"
          ? {
              ...property,
              options: Array.from(
                new Set([...(property.options ?? []), option])
              ),
            }
          : property
      )
    )

  return (
    <section
      data-cy={`database-block-${block.id}`}
      className="w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
      onContextMenuCapture={(event) => event.stopPropagation()}
    >
      <header className="sticky left-0 z-20 flex min-w-full flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          aria-label={t("Database title")}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
          disabled={readOnly}
          placeholder={t("Untitled database")}
          value={title}
          onChange={(event) =>
            onUpdateDatabase(
              { title: event.currentTarget.value },
              `database-title:${block.id}`
            )
          }
          onBlur={onCommit}
        />
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <NewDatabasePropertyMenu
              hasStatus={hasStatus}
              onAdd={addProperty}
            />
          ) : null}
          <div
            className="inline-flex w-fit rounded-lg border bg-background p-0.5"
            role="group"
            aria-label={t("Database view")}
          >
            <ViewButton
              active={view === "table"}
              disabled={readOnly || !hasStatus}
              icon={<Table2Icon className="size-3.5" />}
              label={t("Table")}
              onClick={() => onUpdateDatabase({ view: "table" })}
            />
            <ViewButton
              active={view === "board"}
              disabled={readOnly}
              icon={<Columns3Icon className="size-3.5" />}
              label={t("Board")}
              onClick={() => onUpdateDatabase({ view: "board" })}
            />
          </div>
        </div>
      </header>

      {view === "table" ? (
        <DatabaseTable
          rows={databaseRows}
          properties={properties}
          statuses={statuses}
          readOnly={readOnly}
          onAddRow={onAddRow}
          onUpdateRow={onUpdateRow}
          onDeleteRow={onDeleteRow}
          onOpenRow={onOpenRow}
          onRenameProperty={(propertyId, name) =>
            updateSchema(
              properties.map((property) =>
                property.id === propertyId ? { ...property, name } : property
              ),
              `database-property-name:${block.id}:${propertyId}`
            )
          }
          onResizeProperty={(propertyId, width) =>
            updateSchema(
              properties.map((property) =>
                property.id === propertyId ? { ...property, width } : property
              ),
              `database-property-width:${block.id}:${propertyId}`
            )
          }
          onMoveProperty={moveProperty}
          onDeleteProperty={deleteProperty}
          onAddStatus={addStatus}
          onCreateTagOption={createTagOption}
          onCommit={onCommit}
        />
      ) : (
        <DatabaseBoard
          rows={databaseRows}
          properties={properties}
          statuses={statuses}
          readOnly={readOnly}
          onAddRow={onAddRow}
          onUpdateRow={onUpdateRow}
          onDeleteRow={onDeleteRow}
          onOpenRow={onOpenRow}
          onRenameStatus={(statusId, name) =>
            updateStatuses(
              statuses.map((status) =>
                status.id === statusId ? { ...status, name } : status
              ),
              `database-status-name:${block.id}:${statusId}`
            )
          }
          onMoveStatus={(statusId, targetStatusId) => {
            const sourceIndex = statuses.findIndex(
              (status) => status.id === statusId
            )
            const targetIndex = statuses.findIndex(
              (status) => status.id === targetStatusId
            )
            if (sourceIndex < 0 || targetIndex < 0) return
            const next = [...statuses]
            const [moved] = next.splice(sourceIndex, 1)
            next.splice(targetIndex, 0, moved!)
            updateStatuses(next)
          }}
          onChangeStatusColor={(statusId, color) =>
            updateStatuses(
              statuses.map((status) =>
                status.id === statusId ? { ...status, color } : status
              )
            )
          }
          onCreateTagOption={createTagOption}
          onCommit={onCommit}
        />
      )}
    </section>
  )
}

function ViewButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function propertyText(block: Block, key: string): string {
  const value = block.properties[key]
  return typeof value === "string" ? value : ""
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
