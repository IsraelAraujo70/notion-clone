"use client"

import type { BlockType } from "@reason/core/contracts"
import { useI18n } from "@/lib/i18n/i18n-provider"
import {
  ClipboardPasteIcon,
  CopyIcon,
  CopyPlusIcon,
  ListTreeIcon,
  Redo2Icon,
  ScissorsIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useSlashItems } from "./SlashMenu"

export type BlockMenuAction =
  | "ai_transform"
  | "ai_continue"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "duplicate"
  | "select_all"
  | "delete"

interface Props {
  count: number
  canWrite: boolean
  canContinue: boolean
  canPaste: boolean
  onCloseAutoFocus?: (event: Event) => void
  onAction: (action: BlockMenuAction) => void
  onTurnInto: (blockType: BlockType) => void
}

export function BlockContextOptionsContent(props: Props) {
  const { t } = useI18n()
  const turnIntoItems = useSlashItems().filter(
    (item) => !["image", "divider", "mermaid"].includes(item.type)
  )
  const selectionLabel = t(
    props.count === 1 ? "{count} block selected" : "{count} blocks selected",
    { count: props.count }
  )

  return (
    <ContextMenuContent
      data-cy="block-context-menu"
      aria-label={t("Block options")}
      className="min-w-60"
      onCloseAutoFocus={props.onCloseAutoFocus}
    >
      <ContextMenuLabel>{selectionLabel}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!props.canWrite}
          onSelect={() => props.onAction("ai_transform")}
          data-cy="block-menu-ai-transform"
        >
          <SparklesIcon /> {t("Edit with AI")}
        </ContextMenuItem>
        {props.canContinue ? (
          <ContextMenuItem
            data-cy="block-menu-ai-continue"
            onSelect={() => props.onAction("ai_continue")}
          >
            <SparklesIcon /> {t("Continue writing")}
          </ContextMenuItem>
        ) : null}
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          onSelect={() => props.onAction("undo")}
          disabled={!props.canWrite}
        >
          <Undo2Icon /> {t("Undo")}{" "}
          <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("redo")}
          disabled={!props.canWrite}
        >
          <Redo2Icon /> {t("Redo")}{" "}
          <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("cut")}
          disabled={!props.canWrite}
          data-cy="block-menu-cut"
        >
          <ScissorsIcon /> {t("Cut")}{" "}
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("copy")}
          data-cy="block-menu-copy"
        >
          <CopyIcon /> {t("Copy")} <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("paste")}
          disabled={!props.canWrite || !props.canPaste}
        >
          <ClipboardPasteIcon /> {t("Paste")}{" "}
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("duplicate")}
          disabled={!props.canWrite}
        >
          <CopyPlusIcon /> {t("Duplicate")}{" "}
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!props.canWrite}>
          <ListTreeIcon /> {t("Turn into")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-72 overflow-y-auto">
          {turnIntoItems.map((item) => (
            <ContextMenuItem
              key={item.type}
              onSelect={() => props.onTurnInto(item.type)}
            >
              <span aria-hidden="true" className="w-5 text-center text-xs">
                {item.icon}
              </span>
              {item.label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => props.onAction("select_all")}>
        {t("Select all")} <ContextMenuShortcut>⌘A</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={!props.canWrite}
        onSelect={() => props.onAction("delete")}
        data-cy="block-menu-delete"
      >
        <Trash2Icon /> {t("Delete")}
        {props.count > 1 ? ` (${props.count})` : ""}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export function BlockDropdownOptionsContent(props: Props) {
  const { t } = useI18n()
  const turnIntoItems = useSlashItems().filter(
    (item) => !["image", "divider", "mermaid"].includes(item.type)
  )
  const selectionLabel = t(
    props.count === 1 ? "{count} block selected" : "{count} blocks selected",
    { count: props.count }
  )

  return (
    <DropdownMenuContent align="start" className="min-w-60">
      <DropdownMenuLabel>{selectionLabel}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          disabled={!props.canWrite}
          onSelect={() => props.onAction("ai_transform")}
        >
          <SparklesIcon /> {t("Edit with AI")}
        </DropdownMenuItem>
        {props.canContinue ? (
          <DropdownMenuItem onSelect={() => props.onAction("ai_continue")}>
            <SparklesIcon /> {t("Continue writing")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          onSelect={() => props.onAction("undo")}
          disabled={!props.canWrite}
        >
          <Undo2Icon /> {t("Undo")}{" "}
          <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onAction("redo")}
          disabled={!props.canWrite}
        >
          <Redo2Icon /> {t("Redo")}{" "}
          <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onAction("cut")}
          disabled={!props.canWrite}
        >
          <ScissorsIcon /> {t("Cut")}{" "}
          <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onAction("copy")}>
          <CopyIcon /> {t("Copy")}{" "}
          <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onAction("paste")}
          disabled={!props.canWrite || !props.canPaste}
        >
          <ClipboardPasteIcon /> {t("Paste")}{" "}
          <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onAction("duplicate")}
          disabled={!props.canWrite}
        >
          <CopyPlusIcon /> {t("Duplicate")}{" "}
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={!props.canWrite}>
          <ListTreeIcon /> {t("Turn into")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
          {turnIntoItems.map((item) => (
            <DropdownMenuItem
              key={item.type}
              onSelect={() => props.onTurnInto(item.type)}
            >
              <span aria-hidden="true" className="w-5 text-center text-xs">
                {item.icon}
              </span>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onSelect={() => props.onAction("select_all")}>
        {t("Select all")} <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={!props.canWrite}
        onSelect={() => props.onAction("delete")}
      >
        <Trash2Icon /> {t("Delete")}
        {props.count > 1 ? ` (${props.count})` : ""}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
