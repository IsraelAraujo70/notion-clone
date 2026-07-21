import {
  CheckIcon,
  FilePlusIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Message } from "@/lib/i18n/messages"
import type { AiOperationApproval as Approval } from "../organisms/use-ai-assistant-controller"

export function operationDetails(approval: Approval): {
  icon: typeof PencilIcon
  title: Message
  detail: string
} {
  const operation = approval.operation
  switch (operation.type) {
    case "insert_block":
      return {
        icon: FilePlusIcon,
        title: operation.block.type === "page" ? "Create page" : "Add content",
        detail: String(
          operation.block.properties.title ??
            operation.block.properties.text ??
            operation.block.type
        ),
      }
    case "update_block":
      return {
        icon: PencilIcon,
        title: "Edit content",
        detail: String(
          operation.properties?.title ??
            operation.properties?.text ??
            operation.blockId
        ),
      }
    case "move_block":
      return {
        icon: PencilIcon,
        title: "Move content",
        detail: operation.blockId,
      }
    case "delete_block":
      return {
        icon: Trash2Icon,
        title: "Move to trash",
        detail: operation.blockId,
      }
    case "restore_block":
      return {
        icon: RotateCcwIcon,
        title: "Restore content",
        detail: operation.blockId,
      }
    default:
      return {
        icon: PencilIcon,
        title: "Change content",
        detail: operation.opId,
      }
  }
}

export function AiOperationApproval({
  approval,
  onDecision,
}: {
  approval: Approval
  onDecision: (approved: boolean, allowConversation?: boolean) => void
}) {
  const { t } = useI18n()
  const details = operationDetails(approval)
  const Icon = details.icon
  const pending = approval.status === "pending"

  return (
    <section className="rounded-xl border bg-muted/30 p-3" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t(details.title)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {details.detail}
          </p>
        </div>
        {approval.status === "approved" ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckIcon className="size-3.5" /> {t("Allowed")}
          </span>
        ) : approval.status === "rejected" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <XIcon className="size-3.5" /> {t("Denied")}
          </span>
        ) : approval.status === "failed" ? (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <XIcon className="size-3.5" /> {t("Failed")}
          </span>
        ) : null}
      </div>
      {pending || approval.status === "deciding" ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!pending}
            onClick={() => onDecision(false)}
          >
            {t("Deny")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!pending}
            onClick={() => onDecision(true)}
          >
            {t("Allow once")}
          </Button>
          <Button
            size="sm"
            disabled={!pending}
            onClick={() => onDecision(true, true)}
          >
            {t("Allow in this conversation")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
