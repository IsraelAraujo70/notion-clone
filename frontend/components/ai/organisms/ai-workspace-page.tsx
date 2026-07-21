"use client"

import { AiAssistant } from "@/components/ai/organisms/ai-assistant"
import { usePages } from "@/components/pages/page-provider"
import { Spinner } from "@/components/ui/spinner"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { useAuth } from "@/lib/auth"

export function AiWorkspacePage() {
  const { token } = useAuth()
  const { activeWorkspaceId } = useWorkspace()
  const { canWrite, pages, refreshPages } = usePages()

  if (!token || !activeWorkspaceId) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AiAssistant
        variant="page"
        token={token}
        workspaceId={activeWorkspaceId}
        pages={pages}
        pageBlockIds={[]}
        selectedBlockIds={[]}
        anchorBlockId={null}
        canWrite={canWrite}
        requestedAction={null}
        onRequestedActionHandled={() => {}}
        onRunCompleted={() => {}}
        onOperationApproved={() => void refreshPages()}
        onBeforeMutatingAction={async () => {}}
      />
    </div>
  )
}
