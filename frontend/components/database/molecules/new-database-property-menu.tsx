"use client"

import type { DatabasePropertyType } from "@reason/core/database"
import { PlusIcon } from "lucide-react"

import { DatabasePropertyIcon } from "@/components/database/atoms/database-property-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n/i18n-provider"

export function NewDatabasePropertyMenu({
  hasStatus,
  onAdd,
}: {
  hasStatus: boolean
  onAdd: (type: DatabasePropertyType) => void
}) {
  const { t } = useI18n()
  const types: DatabasePropertyType[] = [
    "text",
    "number",
    "checkbox",
    "tags",
    "date",
    ...(!hasStatus ? (["status"] as const) : []),
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <PlusIcon data-icon="inline-start" />
          {t("New property")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("Property type")}</DropdownMenuLabel>
          {types.map((type) => (
            <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
              <DatabasePropertyIcon type={type} />
              {propertyTypeName(type, t)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function propertyTypeName(
  type: DatabasePropertyType,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (type === "title") return t("Name")
  if (type === "status") return t("Status")
  if (type === "number") return t("Number")
  if (type === "checkbox") return t("Checkbox")
  if (type === "tags") return t("Tags")
  if (type === "date") return t("Date")
  return t("Text")
}
