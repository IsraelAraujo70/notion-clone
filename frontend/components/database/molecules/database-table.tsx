"use client"

import type { Block, JsonValue } from "@reason/core/contracts"
import type { DatabaseProperty, DatabaseStatus } from "@reason/core/database"
import { PlusIcon } from "lucide-react"

import { DatabasePropertyIcon } from "@/components/database/atoms/database-property-icon"
import { DatabasePropertyHeader } from "./database-property-header"
import { DeleteRowButton, PropertyCell } from "./database-property-cell"
import { useI18n } from "@/lib/i18n/i18n-provider"

interface DatabaseTableProps {
  rows: Block[]
  properties: DatabaseProperty[]
  statuses: DatabaseStatus[]
  readOnly: boolean
  onAddRow: (status: string) => void
  onUpdateRow: (
    rowId: string,
    properties: Record<string, JsonValue | null>,
    coalesceKey?: string
  ) => void
  onDeleteRow: (rowId: string) => void
  onRenameProperty: (propertyId: string, name: string) => void
  onResizeProperty: (propertyId: string, width: number) => void
  onMoveProperty: (propertyId: string, direction: -1 | 1) => void
  onDeleteProperty: (propertyId: string) => void
  onAddStatus: () => void
  onCreateTagOption: (propertyId: string, option: string) => void
  onOpenRow?: (rowId: string) => void
  onCommit: () => void
}

export function DatabaseTable({
  rows,
  properties,
  statuses,
  readOnly,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onRenameProperty,
  onResizeProperty,
  onMoveProperty,
  onDeleteProperty,
  onAddStatus,
  onCreateTagOption,
  onOpenRow,
  onCommit,
}: DatabaseTableProps) {
  const { t } = useI18n()
  const widths = properties.map((property) =>
    property.width
      ? clampWidth(property.width)
      : contentWidth(property, rows, statuses)
  )
  const tableWidth =
    widths.reduce((total, width) => total + width, 0) + (readOnly ? 0 : 40)

  return (
    <div>
      <div className="min-w-full" style={{ width: tableWidth }}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {properties.map((property, index) => (
              <col key={property.id} style={{ width: widths[index] }} />
            ))}
            {!readOnly ? <col style={{ width: 40 }} /> : null}
          </colgroup>
          <thead className="bg-muted/30 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <tr>
              {properties.map((property, index) => (
                <th
                  key={property.id}
                  className={`relative px-3 py-2 ${index > 0 ? "border-l" : ""}`}
                >
                  {readOnly ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <DatabasePropertyIcon
                        type={property.type}
                        className="size-3.5 shrink-0"
                      />
                      <span className="truncate">
                        {displayPropertyName(property, t)}
                      </span>
                    </span>
                  ) : (
                    <DatabasePropertyHeader
                      property={property}
                      name={displayPropertyName(property, t)}
                      canMoveLeft={property.type !== "title" && index > 1}
                      canMoveRight={
                        property.type !== "title" &&
                        index < properties.length - 1
                      }
                      onRename={(name) => onRenameProperty(property.id, name)}
                      onMoveLeft={() => onMoveProperty(property.id, -1)}
                      onMoveRight={() => onMoveProperty(property.id, 1)}
                      onDelete={() => onDeleteProperty(property.id)}
                      onAddStatus={onAddStatus}
                      onCommit={onCommit}
                    />
                  )}
                  {!readOnly ? (
                    <ResizeHandle
                      width={widths[index]!}
                      onResize={(width) =>
                        onResizeProperty(property.id, clampWidth(width))
                      }
                      onCommit={onCommit}
                    />
                  ) : null}
                </th>
              ))}
              {!readOnly ? <th className="border-l px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/20">
                {properties.map((property, index) => (
                  <td
                    key={property.id}
                    className={`px-3 py-1.5 ${index > 0 ? "border-l" : ""}`}
                  >
                    <PropertyCell
                      property={property}
                      row={row}
                      statuses={statuses}
                      readOnly={readOnly}
                      onChange={(value, coalesceKey) =>
                        onUpdateRow(
                          row.id,
                          { [property.id]: value },
                          coalesceKey
                        )
                      }
                      onCommit={onCommit}
                      onCreateTagOption={(option) =>
                        onCreateTagOption(property.id, option)
                      }
                      onOpenRow={
                        property.type === "title" ? onOpenRow : undefined
                      }
                    />
                  </td>
                ))}
                {!readOnly ? (
                  <td className="border-l px-2 py-1.5">
                    <DeleteRowButton onClick={() => onDeleteRow(row.id)} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly ? (
          <button
            type="button"
            className="inline-flex w-full items-center gap-2 border-t px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            onClick={() => onAddRow(statuses[0]!.id)}
          >
            <PlusIcon className="size-4" />
            {t("New row")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ResizeHandle({
  width,
  onResize,
  onCommit,
}: {
  width: number
  onResize: (width: number) => void
  onCommit: () => void
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize property"
      className="absolute top-0 right-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none before:absolute before:top-0 before:left-1/2 before:h-full before:w-px before:bg-transparent hover:before:bg-primary"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startWidth = width
        const move = (moveEvent: PointerEvent) =>
          onResize(startWidth + moveEvent.clientX - startX)
        const up = () => {
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", up)
          document.body.style.cursor = ""
          document.body.style.userSelect = ""
          onCommit()
        }
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up, { once: true })
      }}
    />
  )
}

function contentWidth(
  property: DatabaseProperty,
  rows: Block[],
  statuses: DatabaseStatus[]
): number {
  const values = rows.map((row) => row.properties[property.id])
  const labels =
    property.type === "status"
      ? statuses.map((status) => status.name)
      : values.map((value) =>
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : ""
        )
  const longest = Math.max(
    property.name.length,
    ...labels.map((value) => value.length)
  )
  const minimum = property.type === "checkbox" ? 96 : 140
  return clampWidth(Math.max(minimum, longest * 8 + 56))
}

function clampWidth(width: number): number {
  return Math.min(480, Math.max(88, Math.round(width)))
}

function displayPropertyName(
  property: DatabaseProperty,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (property.id === "title" && property.name === "Name") return t("Name")
  if (property.id === "status" && property.name === "Status") return t("Status")
  return property.name
}
