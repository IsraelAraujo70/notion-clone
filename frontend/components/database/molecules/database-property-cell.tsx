"use client"

import type { Block, JsonValue } from "@reason/core/contracts"
import {
  databaseRowStatus,
  type DatabaseProperty,
  type DatabaseStatus,
} from "@reason/core/database"
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n/i18n-provider"

interface PropertyCellProps {
  property: DatabaseProperty
  row: Block
  statuses: DatabaseStatus[]
  readOnly: boolean
  onChange: (value: JsonValue | null, coalesceKey?: string) => void
  onCommit: () => void
  onOpenRow?: (rowId: string) => void
  onCreateTagOption?: (option: string) => void
}

export function PropertyCell({
  property,
  row,
  statuses,
  readOnly,
  onChange,
  onCommit,
  onOpenRow,
  onCreateTagOption,
}: PropertyCellProps) {
  const { t } = useI18n()
  const value = row.properties[property.id]

  if (property.type === "title") {
    const icon =
      typeof row.properties.icon === "string" && row.properties.icon.length > 0
        ? row.properties.icon
        : "📄"
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        {onOpenRow ? (
          <button
            type="button"
            aria-label={t("Open row")}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onOpenRow(row.id)}
          >
            <span aria-hidden="true" className="text-base leading-none">
              {icon}
            </span>
          </button>
        ) : null}
        <input
          aria-label={t("Row title")}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          disabled={readOnly}
          placeholder={t("Untitled")}
          value={typeof value === "string" ? value : ""}
          onChange={(event) =>
            onChange(event.currentTarget.value, `database-row-title:${row.id}`)
          }
          onBlur={onCommit}
        />
      </div>
    )
  }

  if (property.type === "status") {
    return (
      <select
        aria-label={t("Status")}
        className="w-full bg-transparent outline-none disabled:opacity-100"
        disabled={readOnly}
        value={databaseRowStatus(row.properties, statuses)}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {statusName(status, t)}
          </option>
        ))}
      </select>
    )
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={property.name}
        className="size-4 accent-primary"
        disabled={readOnly}
        checked={value === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    )
  }

  if (property.type === "tags") {
    return (
      <TagsCell
        property={property}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        onCreateOption={onCreateTagOption}
      />
    )
  }

  return (
    <input
      type={
        property.type === "number"
          ? "number"
          : property.type === "date"
            ? "date"
            : "text"
      }
      aria-label={property.name}
      className="block w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      disabled={readOnly}
      value={
        typeof value === "string" || typeof value === "number" ? value : ""
      }
      onChange={(event) => {
        const next = event.currentTarget.value
        onChange(
          property.type === "date" && next === ""
            ? null
            : property.type === "number" && next !== ""
              ? Number(next)
              : next,
          `database-row-property:${row.id}:${property.id}`
        )
      }}
      onBlur={onCommit}
    />
  )
}

function TagsCell({
  property,
  value,
  readOnly,
  onChange,
  onCreateOption,
}: {
  property: DatabaseProperty
  value: JsonValue | undefined
  readOnly: boolean
  onChange: (value: JsonValue) => void
  onCreateOption?: (option: string) => void
}) {
  const { t } = useI18n()
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
  const options = Array.from(
    new Set([...(property.options ?? []), ...selected])
  )
  const tags = (
    <span className="flex min-h-6 min-w-0 flex-wrap items-center gap-1">
      {selected.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
          {!readOnly ? <XIcon aria-hidden="true" /> : null}
        </Badge>
      ))}
      {!readOnly && selected.length === 0 ? (
        <span className="text-muted-foreground">{t("Add tags")}</span>
      ) : null}
    </span>
  )

  if (readOnly) return tags

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={property.name}
          className="w-full text-left"
        >
          {tags}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <Input
          aria-label={t("Find or create tag")}
          placeholder={t("Type a tag and press Enter")}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const input = event.currentTarget
            const next = input.value.trim()
            if (!next) return
            const existing = options.find(
              (option) =>
                option.toLocaleLowerCase() === next.toLocaleLowerCase()
            )
            const option = existing ?? next
            if (!existing) onCreateOption?.(option)
            if (!selected.includes(option)) onChange([...selected, option])
            input.value = ""
          }}
        />
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {options.map((option) => {
            const checked = selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() =>
                  onChange(
                    checked
                      ? selected.filter((tag) => tag !== option)
                      : [...selected, option]
                  )
                }
              >
                <Badge variant="secondary">{option}</Badge>
                {checked ? (
                  <XIcon className="size-3.5" />
                ) : (
                  <PlusIcon className="size-3.5" />
                )}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DeleteRowButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      aria-label={t("Delete row")}
      className="rounded p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
      onClick={onClick}
    >
      <Trash2Icon className="size-3.5" />
    </button>
  )
}

export function statusName(
  status: DatabaseStatus,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (status.id === "not_started" && status.name === "Not started")
    return t("Not started")
  if (status.id === "in_progress" && status.name === "In progress")
    return t("In progress")
  if (status.id === "done" && status.name === "Done") return t("Done")
  return status.name
}
