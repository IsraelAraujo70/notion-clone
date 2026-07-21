"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import Link from "next/link"
import {
  ArrowRightLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { useDashboardTabs } from "@/components/dashboard/dashboard-tabs"
import {
  PAGE_DRAG_MIME,
  pagePath,
  usePages,
} from "@/components/pages/page-provider"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { isUnauthorizedApiError } from "@/lib/api"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import type { PageSummary } from "@/lib/api"
import type { Workspace } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"

function rethrowUnlessUnauthorized(error: unknown) {
  if (!isUnauthorizedApiError(error)) {
    throw error
  }
}

interface PageNode extends PageSummary {
  children: PageNode[]
}

export function buildPageTree(pages: PageSummary[]): PageNode[] {
  const nodes = new Map(
    pages.map((page) => [page.id, { ...page, children: [] as PageNode[] }])
  )
  const roots: PageNode[] = []
  for (const page of pages) {
    const node = nodes.get(page.id)!
    const parent = page.parent_page_id
      ? nodes.get(page.parent_page_id)
      : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function isPageDescendant(
  pages: PageSummary[],
  ancestorId: string,
  candidateId: string
) {
  const parentById = new Map(
    pages.map((page) => [page.id, page.parent_page_id])
  )
  const visited = new Set<string>()
  let current: string | null | undefined = candidateId
  while (current && !visited.has(current)) {
    if (current === ancestorId) return true
    visited.add(current)
    current = parentById.get(current)
  }
  return false
}

function PageIcon({
  icon,
  className,
  dataCy,
}: {
  icon: string
  className?: string
  dataCy?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-cy={dataCy}
      className={
        className ??
        "flex size-5 shrink-0 items-center justify-center text-base leading-none"
      }
    >
      {icon || "📄"}
    </span>
  )
}

function RenameDialog({
  node,
  open,
  onOpenChange,
}: {
  node: PageNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { renamePage } = usePages()
  const [title, setTitle] = useState(node.title)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await renamePage(node.id, title.trim())
      onOpenChange(false)
    } catch (error) {
      rethrowUnlessUnauthorized(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-cy="rename-page-dialog">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("Rename page")}</DialogTitle>
          </DialogHeader>
          <Input
            className="my-4"
            value={title}
            placeholder={t("Untitled")}
            data-cy="rename-page-input"
            onChange={(event) => setTitle(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              data-cy="rename-page-submit"
            >
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoveWorkspaceDialog({
  node,
  destinations,
  open,
  onOpenChange,
}: {
  node: PageNode
  destinations: Workspace[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { movePageToWorkspace } = usePages()
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "")
  const [moving, setMoving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!destinationId) return
    setMoving(true)
    try {
      await movePageToWorkspace(node.id, destinationId)
      onOpenChange(false)
    } catch (error) {
      rethrowUnlessUnauthorized(error)
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-cy="move-workspace-dialog">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("Move to another workspace")}</DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "The page \"{title}\" and all its subpages will be transferred.",
              { title: node.title || t("Untitled") }
            )}
          </p>
          <label className="my-4 block text-sm font-medium">
            {t("Destination workspace")}
            <select
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-cy="move-workspace-select"
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              {destinations.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={moving || !destinationId}
              data-cy="move-workspace-submit"
            >
              {t("Move page")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PageRow({ node, depth }: { node: PageNode; depth: number }) {
  const { openPage } = useDashboardTabs()
  const { t } = useI18n()
  const {
    pages,
    currentPageId,
    canWrite,
    createChildPage,
    deletePage,
    pageDrag,
    startPageDrag,
    endPageDrag,
  } = usePages()
  const { activeWorkspace, activeWorkspaceId, workspaces } = useWorkspace()
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [moving, setMoving] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverOpenedRef = useRef(false)
  const destinations = workspaces.filter(
    (workspace) =>
      workspace.id !== activeWorkspaceId && workspace.role === "owner"
  )
  const hasChildren = node.children.length > 0
  const title = node.title || t("Untitled")
  const indent = Math.min(depth, 4) * 12
  const leadingOffset = 8 + indent
  const contentOffset = leadingOffset + (hasChildren ? 28 : 0)
  const validDropTarget = Boolean(
    pageDrag &&
    pageDrag.id !== node.id &&
    !isPageDescendant(pages, pageDrag.id, node.id)
  )

  const clearHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
    hoverOpenedRef.current = false
  }

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    },
    []
  )

  const addChild = async () => {
    setBusy(true)
    try {
      const pageId = await createChildPage(node.id)
      setOpen(true)
      openPage(pageId)
    } catch (error) {
      rethrowUnlessUnauthorized(error)
    } finally {
      setBusy(false)
    }
  }

  // O `ContextMenuTrigger` precisa envolver o <a>, não o `SidebarMenuButton`:
  // com a prop `tooltip` o botão embrulha o filho num Tooltip e os handlers do
  // menu de contexto se perdem no caminho.
  const link = (
    <Link
      href={pagePath(node.id)}
      data-cy={`nav-page-${node.id}`}
      data-page-drop-target={validDropTarget ? "true" : undefined}
      aria-label={title}
      title={title}
      draggable={canWrite}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        openPage(node.id, { title: node.title, icon: node.icon })
      }}
      onDragStart={(event) => {
        if (!canWrite) {
          event.preventDefault()
          return
        }
        const drag = { id: node.id, title: node.title, icon: node.icon }
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData(PAGE_DRAG_MIME, JSON.stringify(drag))
        startPageDrag(drag)
      }}
      onDragOver={(event) => {
        if (
          !validDropTarget ||
          !event.dataTransfer.types.includes(PAGE_DRAG_MIME)
        )
          return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        if (
          currentPageId === node.id ||
          hoverTimerRef.current ||
          hoverOpenedRef.current
        )
          return
        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null
          hoverOpenedRef.current = true
          setOpen(true)
          openPage(node.id, {
            title: node.title,
            icon: node.icon,
          })
        }, 600)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return
        clearHover()
      }}
      onDrop={(event) => {
        if (!validDropTarget) return
        event.preventDefault()
        clearHover()
      }}
      onDragEnd={() => {
        clearHover()
        endPageDrag()
      }}
    >
      <PageIcon
        icon={node.icon}
        dataCy={`nav-page-leading-${node.id}`}
        className={
          hasChildren
            ? "hidden size-5 shrink-0 items-center justify-center text-base leading-none group-data-[collapsible=icon]:flex"
            : undefined
        }
      />
      <span
        data-cy={`nav-page-title-${node.id}`}
        className="min-w-24 flex-1 truncate group-data-[collapsible=icon]:hidden"
        title={title}
      >
        {title}
      </span>
    </Link>
  )

  const menuButton = (children: ReactNode) => (
    <SidebarMenuButton
      asChild
      isActive={currentPageId === node.id}
      tooltip={title}
      style={{ paddingInlineStart: `${contentOffset}px` }}
    >
      {children}
    </SidebarMenuButton>
  )

  const addAction = canWrite ? (
    <SidebarMenuAction
      data-cy={`nav-page-plus-${node.id}`}
      aria-label={t("Add subpage")}
      disabled={busy}
      onClick={addChild}
      showOnHover
    >
      <PlusIcon />
    </SidebarMenuAction>
  ) : null

  // A abertura em aba é leitura e também fica disponível para viewers. A raiz do
  // workspace não pode ir para a lixeira: o engine rejeita delete_block sem pai.
  const row = (
    <ContextMenu>
      {menuButton(<ContextMenuTrigger asChild>{link}</ContextMenuTrigger>)}
      <ContextMenuContent
        data-cy={`nav-page-menu-${node.id}`}
        // Ao fechar, o Radix devolve o foco ao gatilho — o que rouba o foco do
        // diálogo de renomear que acabou de abrir e come os primeiros caracteres.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuItem
          data-cy="nav-page-open-tab"
          onSelect={() =>
            openPage(node.id, { title: node.title, icon: node.icon })
          }
        >
          <ExternalLinkIcon />
          {t("Open in new tab")}
        </ContextMenuItem>
        {canWrite ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              data-cy="nav-page-rename"
              onSelect={() => setRenaming(true)}
            >
              <PencilIcon />
              {t("Rename")}
            </ContextMenuItem>
            <ContextMenuItem data-cy="nav-page-add" onSelect={addChild}>
              <PlusIcon />
              {t("Add subpage")}
            </ContextMenuItem>
            {activeWorkspace?.role === "owner" && destinations.length > 0 ? (
              <ContextMenuItem
                data-cy="nav-page-move-workspace"
                onSelect={() => setMoving(true)}
              >
                <ArrowRightLeftIcon />
                {t("Move to another workspace")}
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              data-cy="nav-page-delete"
              disabled={busy}
              onSelect={async () => {
                setBusy(true)
                try {
                  await deletePage(node.id)
                } catch (error) {
                  rethrowUnlessUnauthorized(error)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Trash2Icon />
              {t("Move to trash")}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )

  const body = (
    <>
      {row}
      {addAction}
      {renaming ? (
        <RenameDialog node={node} open onOpenChange={setRenaming} />
      ) : null}
      {moving ? (
        <MoveWorkspaceDialog
          node={node}
          destinations={destinations}
          open
          onOpenChange={setMoving}
        />
      ) : null}
    </>
  )

  const leadingControl = hasChildren ? (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        data-cy={`nav-page-toggle-${node.id}`}
        aria-label={t("Toggle subpages of {title}", { title })}
        style={{ insetInlineStart: `${leadingOffset}px` }}
        className="group/page-tree-toggle absolute top-1.5 z-10 flex size-5 items-center justify-center rounded-sm text-sidebar-foreground outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent focus-visible:ring-2"
      >
        <PageIcon
          icon={node.icon}
          className="shrink-0 text-base leading-none group-focus-within/page-tree-item:hidden group-hover/page-tree-item:hidden"
        />
        <ChevronRightIcon className="hidden size-4 group-focus-within/page-tree-item:block group-hover/page-tree-item:block group-data-[state=open]/page-tree-toggle:rotate-90" />
      </button>
    </CollapsibleTrigger>
  ) : null

  const item = (
    <SidebarMenuItem className="group/page-tree-item min-w-0">
      {leadingControl}
      {body}
    </SidebarMenuItem>
  )

  if (!hasChildren) {
    return item
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem className="group/page-tree-item min-w-0">
        {leadingControl}
        {body}
        <CollapsibleContent>
          <SidebarMenu className="group-data-[collapsible=icon]:hidden">
            {node.children.map((child) => (
              <PageRow key={child.id} node={child} depth={depth + 1} />
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavPages() {
  const { openPage } = useDashboardTabs()
  const { t } = useI18n()
  const { pages, containerPageId, loading, canWrite, createTopLevelPage } =
    usePages()
  const tree = useMemo(() => buildPageTree(pages), [pages])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("Pages")}</SidebarGroupLabel>
      {canWrite && containerPageId ? (
        // O `+` do cabeçalho cria uma página de topo, não uma sub-página.
        <SidebarGroupAction
          data-cy="nav-pages-create"
          aria-label={t("New page")}
          onClick={async () => {
            try {
              openPage(await createTopLevelPage())
            } catch (error) {
              rethrowUnlessUnauthorized(error)
            }
          }}
        >
          <PlusIcon />
        </SidebarGroupAction>
      ) : null}
      <SidebarMenu>
        {loading && pages.length === 0
          ? [0, 1].map((row) => (
              <SidebarMenuItem key={row}>
                <Skeleton className="h-8 w-full" />
              </SidebarMenuItem>
            ))
          : tree.map((node) => <PageRow key={node.id} node={node} depth={0} />)}
      </SidebarMenu>
    </SidebarGroup>
  )
}
