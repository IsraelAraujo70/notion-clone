"use client"

import type { BlockType } from "@/lib/contracts"
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
import { SLASH_ITEMS } from "./SlashMenu"

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
  onAction: (action: BlockMenuAction) => void
  onTurnInto: (blockType: BlockType) => void
}

const TURN_INTO_ITEMS = SLASH_ITEMS.filter(
  (item) => !["image", "divider"].includes(item.type)
)

export function BlockContextOptionsContent(props: Props) {
  return (
    <ContextMenuContent
      data-cy="block-context-menu"
      aria-label="Opções dos blocos"
      className="min-w-60"
    >
      <ContextMenuLabel>
        {props.count === 1 ? "1 bloco selecionado" : `${props.count} blocos selecionados`}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!props.canWrite}
          onSelect={() => props.onAction("ai_transform")}
          data-cy="block-menu-ai-transform"
        >
          <SparklesIcon /> Editar com AI
        </ContextMenuItem>
        {props.canContinue ? (
          <ContextMenuItem
            data-cy="block-menu-ai-continue"
            onSelect={() => props.onAction("ai_continue")}
          >
            <SparklesIcon /> Continuar escrevendo
          </ContextMenuItem>
        ) : null}
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onSelect={() => props.onAction("undo")} disabled={!props.canWrite}>
          <Undo2Icon /> Desfazer <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onAction("redo")} disabled={!props.canWrite}>
          <Redo2Icon /> Refazer <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("cut")}
          disabled={!props.canWrite}
          data-cy="block-menu-cut"
        >
          <ScissorsIcon /> Recortar <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onAction("copy")} data-cy="block-menu-copy">
          <CopyIcon /> Copiar <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("paste")}
          disabled={!props.canWrite || !props.canPaste}
        >
          <ClipboardPasteIcon /> Colar <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => props.onAction("duplicate")}
          disabled={!props.canWrite}
        >
          <CopyPlusIcon /> Duplicar <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!props.canWrite}>
          <ListTreeIcon /> Transformar em
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-72 overflow-y-auto">
          {TURN_INTO_ITEMS.map((item) => (
            <ContextMenuItem key={item.type} onSelect={() => props.onTurnInto(item.type)}>
              <span aria-hidden="true" className="w-5 text-center text-xs">
                {item.icon}
              </span>
              {item.label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => props.onAction("select_all")}>
        Selecionar todos <ContextMenuShortcut>⌘A</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={!props.canWrite}
        onSelect={() => props.onAction("delete")}
        data-cy="block-menu-delete"
      >
        <Trash2Icon /> Apagar{props.count > 1 ? ` (${props.count})` : ""}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export function BlockDropdownOptionsContent(props: Props) {
  return (
    <DropdownMenuContent align="start" className="min-w-60">
      <DropdownMenuLabel>
        {props.count === 1 ? "1 bloco selecionado" : `${props.count} blocos selecionados`}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          disabled={!props.canWrite}
          onSelect={() => props.onAction("ai_transform")}
        >
          <SparklesIcon /> Editar com AI
        </DropdownMenuItem>
        {props.canContinue ? (
          <DropdownMenuItem onSelect={() => props.onAction("ai_continue")}>
            <SparklesIcon /> Continuar escrevendo
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={() => props.onAction("undo")} disabled={!props.canWrite}>
          <Undo2Icon /> Desfazer <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onAction("redo")} disabled={!props.canWrite}>
          <Redo2Icon /> Refazer <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onAction("cut")} disabled={!props.canWrite}>
          <ScissorsIcon /> Recortar <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onAction("copy")}>
          <CopyIcon /> Copiar <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onAction("paste")}
          disabled={!props.canWrite || !props.canPaste}
        >
          <ClipboardPasteIcon /> Colar <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onAction("duplicate")} disabled={!props.canWrite}>
          <CopyPlusIcon /> Duplicar <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={!props.canWrite}>
          <ListTreeIcon /> Transformar em
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
          {TURN_INTO_ITEMS.map((item) => (
            <DropdownMenuItem key={item.type} onSelect={() => props.onTurnInto(item.type)}>
              <span aria-hidden="true" className="w-5 text-center text-xs">
                {item.icon}
              </span>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onSelect={() => props.onAction("select_all")}>
        Selecionar todos <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={!props.canWrite}
        onSelect={() => props.onAction("delete")}
      >
        <Trash2Icon /> Apagar{props.count > 1 ? ` (${props.count})` : ""}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
