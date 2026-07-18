"use client"

import type { DatabaseProperty } from "@reason/core/database"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { DatabasePropertyIcon } from "@/components/database/atoms/database-property-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n/i18n-provider"

interface DatabasePropertyHeaderProps {
  property: DatabaseProperty
  name: string
  canMoveLeft: boolean
  canMoveRight: boolean
  onRename: (name: string) => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onDelete: () => void
  onAddStatus: () => void
  onCommit: () => void
}

export function DatabasePropertyHeader({
  property,
  name,
  canMoveLeft,
  canMoveRight,
  onRename,
  onMoveLeft,
  onMoveRight,
  onDelete,
  onAddStatus,
  onCommit,
}: DatabasePropertyHeaderProps) {
  const { t } = useI18n()
  const isTitle = property.type === "title"

  return (
    <Popover onOpenChange={(open) => !open && onCommit()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Property options")}: ${name}`}
          className="flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
        >
          <DatabasePropertyIcon
            type={property.type}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <Input
          aria-label={t("Property name")}
          value={name}
          onChange={(event) => onRename(event.currentTarget.value)}
          onBlur={onCommit}
        />
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={!canMoveLeft}
            onClick={onMoveLeft}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            {t("Move left")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={!canMoveRight}
            onClick={onMoveRight}
          >
            <ArrowRightIcon data-icon="inline-start" />
            {t("Move right")}
          </Button>
          {property.type === "status" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={onAddStatus}
            >
              <PlusIcon data-icon="inline-start" />
              {t("Add status option")}
            </Button>
          ) : null}
          {!isTitle ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="justify-start"
              onClick={onDelete}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("Delete property")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
