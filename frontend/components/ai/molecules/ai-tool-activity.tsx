"use client"

import { useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  FilePenLineIcon,
  FileSearchIcon,
  LoaderCircleIcon,
  SearchIcon,
  TextSearchIcon,
  WrenchIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { useI18n } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { operationDetails } from "./ai-operation-approval"
import type {
  AiOperationApproval as Approval,
  AiToolActivity as ToolActivity,
} from "../organisms/use-ai-assistant-controller"

function toolPresentation(name: string) {
  switch (name) {
    case "read_page":
      return { icon: FileSearchIcon, label: "Read page" as const }
    case "search_workspace":
      return { icon: SearchIcon, label: "Search workspace" as const }
    case "select_citations":
      return { icon: TextSearchIcon, label: "Select sources" as const }
    case "apply_operations":
      return { icon: FilePenLineIcon, label: "Prepare changes" as const }
    case "read_context":
      return { icon: FileSearchIcon, label: "Read page context" as const }
    default:
      return { icon: WrenchIcon, label: "Use a tool" as const }
  }
}

export function AiToolActivity({
  tools,
  approvals,
}: {
  tools: ToolActivity[]
  approvals: Approval[]
}) {
  const { t } = useI18n()
  const running =
    tools.some((tool) => tool.status === "running") ||
    approvals.some(
      (approval) =>
        approval.status === "pending" || approval.status === "deciding"
        || approval.status === "applying"
    )
  const [open, setOpen] = useState(running)

  if (tools.length === 0 && approvals.length === 0) return null

  const countLabel = [
    tools.length > 0
      ? t("{count} tools", { count: tools.length })
      : null,
    approvals.length > 0
      ? t("{count} changes", { count: approvals.length })
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Marker asChild>
        <CollapsibleTrigger className="group w-full rounded-md px-1 py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
          <MarkerIcon>
            {running ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <WrenchIcon />
            )}
          </MarkerIcon>
          <MarkerContent className="flex min-w-0 flex-1 items-center gap-2">
            <span
              role={running ? "status" : undefined}
              className={cn(
                "font-medium text-foreground/80",
                running && "shimmer"
              )}
            >
              {running ? t("Working...") : countLabel}
            </span>
            {running ? (
              <span className="truncate text-xs text-muted-foreground/70">
                {t(toolPresentation(tools.at(-1)?.name ?? "").label)}
              </span>
            ) : null}
          </MarkerContent>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
      </Marker>
      <CollapsibleContent className="ms-3 mt-1 border-s border-border/60 ps-4">
        <div className="flex flex-col gap-0.5 py-1">
          {tools.map((tool) => {
            const presentation = toolPresentation(tool.name)
            const Icon = presentation.icon
            return (
              <div
                key={tool.id}
                className="flex min-w-0 items-center gap-2 py-1 text-xs text-muted-foreground"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {t(presentation.label)}
                </span>
                {tool.status === "running" ? (
                  <LoaderCircleIcon
                    className="size-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckIcon
                    className="size-3 text-success"
                    aria-hidden="true"
                  />
                )}
                <span className="sr-only">
                  {tool.status === "running"
                    ? t("In progress")
                    : t("Completed")}
                </span>
              </div>
            )
          })}
          {approvals.map((approval) => {
            const details = operationDetails(approval)
            const Icon = details.icon
            const approved = approval.status === "approved"
            const unresolved =
              approval.status === "pending" ||
              approval.status === "deciding" ||
              approval.status === "applying"
            return (
              <div
                key={approval.proposalId}
                className="flex min-w-0 items-center gap-2 py-1 text-xs text-muted-foreground"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="shrink-0 text-foreground/80">
                  {t(details.title)}
                </span>
                <span className="min-w-0 flex-1 truncate opacity-70">
                  {details.detail}
                </span>
                {unresolved ? (
                  <LoaderCircleIcon
                    className="size-3 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : approved ? (
                  <CheckIcon
                    className="size-3 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="shrink-0 text-muted-foreground">
                    {t("Denied")}
                  </span>
                )}
                <span className="sr-only">
                  {unresolved
                    ? t("In progress")
                    : approved
                      ? t("Allowed")
                      : t("Denied")}
                </span>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
