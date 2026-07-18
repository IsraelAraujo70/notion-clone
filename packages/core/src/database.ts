import type { BlockProperties, JsonValue } from "./contracts"

export type DatabaseView = "table" | "board"

export type DatabasePropertyType =
  "title" | "text" | "number" | "checkbox" | "status" | "tags" | "date"

export interface DatabaseProperty {
  id: string
  name: string
  type: DatabasePropertyType
  width?: number
  options?: string[]
}

export interface DatabaseStatus {
  id: string
  name: string
  color: "gray" | "blue" | "green" | "yellow" | "red" | "purple"
}

export const DEFAULT_DATABASE_PROPERTIES: readonly DatabaseProperty[] = [
  { id: "title", name: "Name", type: "title" },
  { id: "status", name: "Status", type: "status" },
]

export const DEFAULT_DATABASE_STATUSES: readonly DatabaseStatus[] = [
  { id: "not_started", name: "Not started", color: "gray" },
  { id: "in_progress", name: "In progress", color: "blue" },
  { id: "done", name: "Done", color: "green" },
]

export function defaultDatabaseProperties(): BlockProperties {
  return {
    title: "",
    view: "table",
    statuses: DEFAULT_DATABASE_STATUSES.map((status) => ({ ...status })),
    schema: DEFAULT_DATABASE_PROPERTIES.map((property) => ({ ...property })),
  }
}

export function databaseView(properties: BlockProperties): DatabaseView {
  return properties.view === "board" ? "board" : "table"
}

export function databaseStatuses(
  properties: BlockProperties
): DatabaseStatus[] {
  const statuses = properties.statuses
  if (!Array.isArray(statuses)) return [...DEFAULT_DATABASE_STATUSES]

  const parsed = statuses.flatMap((value) => {
    if (!isObject(value)) return []
    const { id, name, color } = value
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      !["gray", "blue", "green", "yellow", "red", "purple"].includes(
        String(color)
      )
    ) {
      return []
    }
    return [{ id, name, color: color as DatabaseStatus["color"] }]
  })
  return parsed.length > 0 ? parsed : [...DEFAULT_DATABASE_STATUSES]
}

export function databaseProperties(
  properties: BlockProperties
): DatabaseProperty[] {
  const schema = properties.schema
  if (!Array.isArray(schema)) return cloneDefaultProperties()

  const parsed = schema.flatMap((value) => {
    if (!isObject(value)) return []
    const { id, name, type, width, options } = value
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      ![
        "title",
        "text",
        "number",
        "checkbox",
        "status",
        "tags",
        "date",
      ].includes(String(type)) ||
      (width !== undefined &&
        (typeof width !== "number" || !Number.isFinite(width))) ||
      (options !== undefined && !Array.isArray(options))
    ) {
      return []
    }
    return [
      {
        id,
        name,
        type: type as DatabasePropertyType,
        ...(typeof width === "number" ? { width } : {}),
        ...(Array.isArray(options)
          ? {
              options: options.filter(
                (option, index): option is string =>
                  typeof option === "string" &&
                  option.trim().length > 0 &&
                  options.findIndex((candidate) => candidate === option) ===
                    index
              ),
            }
          : {}),
      },
    ]
  })

  const title = parsed.find((property) => property.type === "title")
  const normalized = [
    {
      ...(title ?? DEFAULT_DATABASE_PROPERTIES[0]!),
      id: "title",
      type: "title" as const,
    },
    ...parsed
      .filter(
        (property) =>
          property.type !== "title" &&
          property.id !== "title" &&
          !(property.id === "status" && property.type !== "status")
      )
      .map((property) =>
        property.type === "status" ? { ...property, id: "status" } : property
      ),
  ]
  const unique = normalized.filter(
    (property, index) =>
      normalized.findIndex((candidate) => candidate.id === property.id) ===
      index
  )
  return unique
}

export function databaseRowStatus(
  properties: BlockProperties,
  statuses: readonly DatabaseStatus[]
): string {
  const status = properties.status
  return typeof status === "string" &&
    statuses.some((item) => item.id === status)
    ? status
    : statuses[0]!.id
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cloneDefaultProperties(): DatabaseProperty[] {
  return DEFAULT_DATABASE_PROPERTIES.map((property) => ({ ...property }))
}
