"use client"

import { useEffect, useMemo, useState } from "react"
import { FileQuestionIcon } from "lucide-react"

import { BlockEditor } from "@/components/editor/BlockEditor"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError, type PublicPageResponse } from "@/lib/api"
import { getBlock, treeFromBlocks } from "@/lib/engine/tree"
import { useI18n } from "@/lib/i18n/i18n-provider"

const EMPTY_COLLAPSED_BLOCKS: ReadonlySet<string> = new Set()

export function PublicPage({ token }: { token: string }) {
  const { t } = useI18n()
  const [response, setResponse] = useState<PublicPageResponse | null>(null)
  const [error, setError] = useState<"not-found" | "request" | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setResponse(null)
      setError(null)
      void api
        .getPublicPage(token)
        .then((nextResponse) => {
          if (!cancelled) setResponse(nextResponse)
        })
        .catch((nextError: unknown) => {
          if (cancelled) return
          setError(
            nextError instanceof ApiError && nextError.status === 404
              ? "not-found"
              : "request"
          )
        })
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const tree = useMemo(
    () =>
      response
        ? treeFromBlocks(response.page.rootId, response.page.blocks)
        : null,
    [response]
  )
  const root = tree ? getBlock(tree, tree.rootId) : null
  const title =
    root && typeof root.properties.title === "string"
      ? root.properties.title
      : ""

  useEffect(() => {
    document.title = `${title || t("Shared page")} · reason`
  }, [t, title])

  if (error) {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
        <Empty data-cy="public-page-error">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestionIcon />
            </EmptyMedia>
            <EmptyTitle>
              {error === "not-found"
                ? t("Page not found")
                : t("Could not open the page")}
            </EmptyTitle>
            <EmptyDescription>
              {error === "not-found"
                ? t("This link does not exist or is no longer public.")
                : t("Try again in a few moments.")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  if (!tree) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-[708px] flex-col gap-4 px-6 py-20">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-4/5" />
      </main>
    )
  }

  const icon =
    root && typeof root.properties.icon === "string" ? root.properties.icon : ""

  return (
    <main
      className="min-h-svh bg-background text-foreground"
      data-cy="public-page"
    >
      <article className="mx-auto flex w-full max-w-[708px] flex-col px-6 py-14 leading-7 md:py-20">
        {icon ? (
          <span aria-hidden="true" className="mb-2 text-5xl leading-none">
            {icon}
          </span>
        ) : null}
        <h1 className="mb-6 text-[40px] leading-tight font-bold break-words">
          {title || t("Untitled")}
        </h1>
        <BlockEditor
          tree={tree}
          collapsed={EMPTY_COLLAPSED_BLOCKS}
          selectedBlockId={null}
          readOnly
          onToggleCollapsed={() => undefined}
          onSelectedBlockChange={() => undefined}
          dispatchBatch={() => undefined}
          undo={() => undefined}
          redo={() => undefined}
        />
      </article>
    </main>
  )
}
