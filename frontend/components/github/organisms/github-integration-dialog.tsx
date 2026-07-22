"use client"

import {
  AlertCircleIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LoaderCircleIcon,
  UnlinkIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"

import type { PageGitHubIntegration } from "@/components/github/use-page-github-integration"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { WorkspaceRole } from "@/lib/api"

export function GitHubIntegrationDialog({
  open,
  onOpenChange,
  integration,
  workspaceRole,
  canWrite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  integration: PageGitHubIntegration
  workspaceRole: WorkspaceRole
  canWrite: boolean
}) {
  const [pullRequestUrl, setPullRequestUrl] = useState("")

  const submitLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = pullRequestUrl.trim()
    if (!url) return
    if (await integration.linkPullRequest(url)) {
      setPullRequestUrl("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranchIcon className="size-4" /> GitHub integration
          </DialogTitle>
          <DialogDescription>
            Connect this page to the pull request where its work is happening.
          </DialogDescription>
        </DialogHeader>

        {integration.loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" /> Loading GitHub
          </div>
        ) : integration.error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not load GitHub</AlertTitle>
            <AlertDescription>
              Try loading the integration again.
            </AlertDescription>
            <Button size="sm" variant="outline" onClick={integration.reload}>
              Try again
            </Button>
          </Alert>
        ) : !integration.configured ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>GitHub is unavailable</AlertTitle>
            <AlertDescription>
              The Reason server does not have GitHub App credentials configured.
            </AlertDescription>
          </Alert>
        ) : !integration.installation ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Install the Reason GitHub App before linking pull requests.
            </p>
            {workspaceRole === "owner" ? (
              <Button
                disabled={integration.busy}
                onClick={() => void integration.connectGitHub()}
              >
                {integration.busy ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <GitBranchIcon />
                )}
                Connect GitHub
              </Button>
            ) : (
              <Alert>
                <AlertDescription>
                  A workspace owner must install the GitHub App first.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : integration.link ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-start gap-2">
              <GitPullRequestIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {integration.link.owner}/{integration.link.repository}#
                  {integration.link.pull_number}
                </p>
                <p className="truncate text-sm font-medium">
                  {integration.link.title}
                </p>
              </div>
            </div>
            {canWrite ? (
              <Button
                variant="outline"
                disabled={integration.busy}
                onClick={() => void integration.unlinkPullRequest()}
              >
                <UnlinkIcon data-icon="inline-start" /> Unlink pull request
              </Button>
            ) : null}
          </div>
        ) : canWrite ? (
          <form onSubmit={submitLink}>
            <Field>
              <FieldLabel htmlFor="github-pull-request-url">
                Pull request URL
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="github-pull-request-url"
                  type="url"
                  required
                  value={pullRequestUrl}
                  placeholder="https://github.com/owner/repository/pull/123"
                  disabled={integration.busy}
                  onChange={(event) =>
                    setPullRequestUrl(event.currentTarget.value)
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    variant="secondary"
                    disabled={integration.busy || !pullRequestUrl.trim()}
                  >
                    {integration.busy ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : null}
                    Link PR
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Installed as {integration.installation.account_login}.
              </FieldDescription>
            </Field>
          </form>
        ) : (
          <Alert>
            <AlertDescription>
              You need edit access to link a pull request.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
