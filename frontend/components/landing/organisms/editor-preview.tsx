"use client"

import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronRightIcon,
  CommandIcon,
  MousePointer2Icon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { ReasonMark } from "@/components/atoms/brand"
import { useI18n } from "@/lib/i18n/i18n-provider"

const presencePeople = [
  { initials: "MB", live: true, color: "#3aa655" },
  { initials: "JS", live: false, color: "#4c8bf5" },
  { initials: "LT", live: false, color: "#f0653a" },
] as const

function PreviewSidebar() {
  const { t } = useI18n()

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1 font-semibold">
        <span className="grid size-5 place-items-center">
          <ReasonMark />
        </span>
        reason
      </div>

      <nav className="space-y-0.5 px-2 py-2 text-sm">
        <div className="flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground">
          <SearchIcon className="size-4" aria-hidden="true" />
          <span className="flex-1">{t("Search")}</span>
          <kbd className="text-[10px] text-muted-foreground/70">⌘K</kbd>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground">
          <Trash2Icon className="size-4" aria-hidden="true" />
          {t("Trash")}
        </div>
      </nav>

      <div className="px-2">
        <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
          {t("Pages")}
          <PlusIcon className="size-3.5" aria-hidden="true" />
        </div>
        <div className="space-y-0.5 text-sm">
          <div className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground">
            <ChevronDownIcon
              className="size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span aria-hidden="true">📚</span>
            <span className="truncate">{t("Team wiki")}</span>
          </div>
          <div className="ml-4 space-y-0.5">
            <div className="flex h-8 items-center gap-1.5 rounded-md bg-sidebar-accent px-2 font-medium text-sidebar-accent-foreground">
              <span aria-hidden="true">🚀</span>
              <span className="truncate">{t("Launch notes")}</span>
            </div>
            <div className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground">
              <span aria-hidden="true">📝</span>
              <span className="truncate">{t("Retros")}</span>
            </div>
          </div>
          <div className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground">
            <ChevronRightIcon
              className="size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span aria-hidden="true">📌</span>
            <span className="truncate">{t("Roadmap")}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t p-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8f1ff] text-[11px] font-semibold text-[#1459a8]">
          AR
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">Ada Ribeiro</p>
          <p className="truncate text-xs text-muted-foreground">
            ada@reason.app
          </p>
        </div>
        <ChevronsUpDownIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </aside>
  )
}

function PreviewTopBar() {
  const { t } = useI18n()

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <p className="min-w-0 flex-1 truncate text-sm">
        <span aria-hidden="true" className="mr-1">
          🚀
        </span>
        {t("Launch notes")}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground sm:flex">
          <SparklesIcon className="size-4" aria-hidden="true" />
          {t("Summarize")}
        </span>
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground">
          <Share2Icon className="size-4" aria-hidden="true" />
          {t("Share")}
        </span>
        <span aria-hidden="true" className="flex -space-x-1.5">
          {presencePeople.map((person) => (
            <span
              key={person.initials}
              className="grid size-6 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-background"
              style={
                person.live
                  ? { boxShadow: `0 0 0 2px ${person.color}` }
                  : undefined
              }
            >
              {person.initials}
            </span>
          ))}
        </span>
        <span className="text-xs text-muted-foreground max-sm:sr-only">
          {t("Saved")}
        </span>
      </div>
    </div>
  )
}

function PreviewBlocks() {
  const { t } = useI18n()

  return (
    <div className="mx-auto w-full max-w-[708px] px-6 py-8 sm:px-10">
      <div aria-hidden="true" className="mb-1 text-[44px] leading-none">
        🚀
      </div>
      <h2 className="mb-6 text-[40px] leading-tight font-bold">
        {t("Launch notes")}
      </h2>

      <div className="space-y-1 leading-7">
        <p>{t("Write, reorder, and reshape ideas one block at a time.")}</p>

        <div className="flex items-center gap-1.5 py-0.5">
          <ChevronRightIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{t("Expandable idea")}</span>
        </div>

        <label className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked
            readOnly
            tabIndex={-1}
            className="size-4 accent-primary"
          />
          <span className="text-muted-foreground line-through">
            {t("Turn every edit into an operation")}
          </span>
        </label>

        <blockquote className="border-l-4 border-border py-0.5 pl-3 text-muted-foreground italic">
          {t("A page is a block with children.")}
        </blockquote>

        <div className="flex items-start gap-2 rounded-md bg-secondary px-3 py-2.5">
          <span aria-hidden="true">💡</span>
          <span>{t("Everything you write is a block.")}</span>
        </div>

        <hr className="border-border py-1" />

        <div className="overflow-hidden rounded-md bg-muted">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
            <span>{t("Code")}</span>
            <span className="flex items-center gap-1">
              TypeScript
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </span>
          </div>
          <pre className="px-3 pb-3 font-mono text-sm">
            {t("apply(operation)")}
          </pre>
        </div>
      </div>
    </div>
  )
}

export function EditorPreview() {
  const { t } = useI18n()

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -top-8 left-3 hidden rotate-[-12deg] items-center gap-2 rounded-full border bg-[#fff3bf] px-3 py-2 text-sm font-medium text-[#443100] shadow-sm sm:flex">
        <MousePointer2Icon className="size-4" aria-hidden="true" />
        {t("drag blocks")}
      </div>
      <div className="absolute -top-7 right-4 hidden rotate-[8deg] items-center gap-2 rounded-full border bg-[#e8f1ff] px-3 py-2 text-sm font-medium text-[#124d91] shadow-sm sm:flex">
        <CommandIcon className="size-4" aria-hidden="true" />
        {t("Slash commands")}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-[0_24px_80px_rgba(15,15,15,0.10)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex h-10 items-center justify-between border-b bg-muted/70 px-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="text-xs text-muted-foreground">
            {t("Workspace page")}
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {t("Blocks")}
          </div>
        </div>

        <div className="flex min-h-[520px] bg-background">
          <PreviewSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <PreviewTopBar />
            <div className="min-w-0 flex-1">
              <PreviewBlocks />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
