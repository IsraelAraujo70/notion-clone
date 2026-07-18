"use client"

import { useState } from "react"

import type { Block, JsonValue } from "@reason/core/contracts"
import {
  databaseRowStatus,
  type DatabaseProperty,
  type DatabaseStatus,
} from "@reason/core/database"
import { GripVerticalIcon, PlusIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DeleteRowButton,
  PropertyCell,
  statusName,
} from "./database-property-cell"
import { useI18n } from "@/lib/i18n/i18n-provider"

const ROW_DRAG_TYPE = "application/x-reason-database-row"
const STATUS_DRAG_TYPE = "application/x-reason-database-status"
const STATUS_COLORS: DatabaseStatus["color"][] = [
  "gray",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
]

interface DatabaseBoardProps {
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
  onRenameStatus: (statusId: string, name: string) => void
  onMoveStatus: (statusId: string, targetStatusId: string) => void
  onChangeStatusColor: (
    statusId: string,
    color: DatabaseStatus["color"]
  ) => void
  onCreateTagOption: (propertyId: string, option: string) => void
  onOpenRow?: (rowId: string) => void
  onCommit: () => void
}

export function DatabaseBoard(props: DatabaseBoardProps) {
  const rowIds = new Set(props.rows.map((row) => row.id))
  return (
    <div className="overflow-x-auto p-3">
      <div className="flex min-w-max gap-3">
        {props.statuses.map((status) => (
          <BoardColumn
            key={status.id}
            {...props}
            status={status}
            allowedRowIds={rowIds}
            rows={props.rows.filter(
              (row) =>
                databaseRowStatus(row.properties, props.statuses) === status.id
            )}
          />
        ))}
      </div>
    </div>
  )
}

function BoardColumn({
  rows,
  properties,
  statuses,
  status,
  allowedRowIds,
  readOnly,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onRenameStatus,
  onMoveStatus,
  onChangeStatusColor,
  onCreateTagOption,
  onOpenRow,
  onCommit,
}: DatabaseBoardProps & {
  status: DatabaseStatus
  allowedRowIds: ReadonlySet<string>
}) {
  const { t } = useI18n()
  const visibleProperties = properties.filter(
    (property) => property.type !== "status"
  )
  return (
    <div
      data-cy={`database-column-${status.id}`}
      className="w-64 rounded-lg bg-muted/35 p-2"
      onDragOver={(event) => {
        if (
          readOnly ||
          (!event.dataTransfer.types.includes(ROW_DRAG_TYPE) &&
            !event.dataTransfer.types.includes(STATUS_DRAG_TYPE))
        )
          return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDrop={(event) => {
        if (readOnly) return
        const statusId = event.dataTransfer.getData(STATUS_DRAG_TYPE)
        if (
          statusId &&
          statusId !== status.id &&
          statuses.some((item) => item.id === statusId)
        ) {
          event.preventDefault()
          event.stopPropagation()
          onMoveStatus(statusId, status.id)
          return
        }
        const rowId = event.dataTransfer.getData(ROW_DRAG_TYPE)
        if (!rowId || !allowedRowIds.has(rowId)) return
        event.preventDefault()
        event.stopPropagation()
        onUpdateRow(rowId, { status: status.id })
      }}
    >
      <div className="mb-2 flex items-center gap-2 px-1 py-1 text-xs font-semibold tracking-wide uppercase">
        {!readOnly ? (
          <button
            type="button"
            draggable
            aria-label={`${t("Move status")}: ${statusName(status, t)}`}
            className="cursor-grab rounded-sm text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData(STATUS_DRAG_TYPE, status.id)
            }}
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
        ) : null}
        <StatusColorPicker
          status={status}
          readOnly={readOnly}
          onChange={(color) => onChangeStatusColor(status.id, color)}
        />
        {readOnly ? (
          <span className="truncate">{statusName(status, t)}</span>
        ) : (
          <input
            aria-label={t("Status name")}
            className="min-w-0 flex-1 bg-transparent font-semibold tracking-wide uppercase outline-none"
            value={statusName(status, t)}
            onChange={(event) =>
              onRenameStatus(status.id, event.currentTarget.value)
            }
            onBlur={onCommit}
          />
        )}
        <span className="ml-auto text-muted-foreground">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <article
            key={row.id}
            draggable={!readOnly}
            className="group/card rounded-lg border bg-background p-3 shadow-xs"
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData(ROW_DRAG_TYPE, row.id)
            }}
          >
            <div className="flex items-start gap-1.5">
              {!readOnly ? (
                <GripVerticalIcon className="mt-1 size-4 shrink-0 text-muted-foreground/50" />
              ) : null}
              <div className="min-w-0 flex-1">
                {visibleProperties.map((property, index) => (
                  <div
                    key={property.id}
                    className={
                      index === 0
                        ? ""
                        : property.type === "date"
                          ? "mt-2 flex flex-col gap-0.5"
                          : "mt-2 flex items-center gap-2"
                    }
                  >
                    {index > 0 ? (
                      <span
                        className={
                          property.type === "date"
                            ? "truncate text-[11px] text-muted-foreground"
                            : "w-16 shrink-0 truncate text-[11px] text-muted-foreground"
                        }
                      >
                        {property.name}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
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
                    </div>
                  </div>
                ))}
              </div>
              {!readOnly ? (
                <DeleteRowButton onClick={() => onDeleteRow(row.id)} />
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!readOnly ? (
        <button
          type="button"
          className="mt-2 inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          onClick={() => onAddRow(status.id)}
        >
          <PlusIcon className="size-3.5" />
          {t("New card")}
        </button>
      ) : null}
    </div>
  )
}

function StatusColorPicker({
  status,
  readOnly,
  onChange,
}: {
  status: DatabaseStatus
  readOnly: boolean
  onChange: (color: DatabaseStatus["color"]) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const dot = (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${statusDot(status.color)}`}
    />
  )

  if (readOnly) return dot

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Status color")}: ${statusName(status, t)}`}
          className="grid size-5 shrink-0 place-items-center rounded hover:bg-muted"
        >
          {dot}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          {t("Status color")}
        </p>
        <div className="flex gap-1">
          {STATUS_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={t(statusColorName(color))}
              aria-pressed={status.color === color}
              className="grid size-7 place-items-center rounded-md hover:bg-muted aria-pressed:ring-1 aria-pressed:ring-ring"
              onClick={() => {
                onChange(color)
                setOpen(false)
              }}
            >
              <span
                aria-hidden="true"
                className={`size-3 rounded-full ${statusDot(color)}`}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function statusDot(color: DatabaseStatus["color"]): string {
  const colors = {
    gray: "bg-zinc-400",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    red: "bg-red-500",
    purple: "bg-violet-500",
  }
  return colors[color]
}

function statusColorName(
  color: DatabaseStatus["color"]
): Parameters<ReturnType<typeof useI18n>["t"]>[0] {
  const names = {
    gray: "Gray",
    blue: "Blue",
    green: "Green",
    yellow: "Yellow",
    red: "Red",
    purple: "Purple",
  } as const
  return names[color]
}
