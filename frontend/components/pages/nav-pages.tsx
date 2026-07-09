"use client"

import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { pagePath, usePages } from "@/components/pages/page-provider"
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
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import type { PageSummary } from "@/lib/api"

const UNTITLED = "Sem título"

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

function PageIcon({ icon }: { icon: string }) {
  return (
    <span aria-hidden="true" className="text-base leading-none">
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
            <DialogTitle>Renomear página</DialogTitle>
          </DialogHeader>
          <Input
            className="my-4"
            value={title}
            placeholder={UNTITLED}
            data-cy="rename-page-input"
            onChange={(event) => setTitle(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              data-cy="rename-page-submit"
            >
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PageRow({ node }: { node: PageNode }) {
  const router = useRouter()
  const { currentPageId, canWrite, createChildPage, deletePage } = usePages()
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const addChild = async () => {
    setBusy(true)
    try {
      const pageId = await createChildPage(node.id)
      setOpen(true)
      router.push(pagePath(pageId))
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
    <Link href={pagePath(node.id)} data-cy={`nav-page-${node.id}`}>
      <PageIcon icon={node.icon} />
      <span className="truncate">{node.title || UNTITLED}</span>
    </Link>
  )

  const menuButton = (children: ReactNode) => (
    <SidebarMenuButton
      asChild
      isActive={currentPageId === node.id}
      tooltip={node.title || UNTITLED}
    >
      {children}
    </SidebarMenuButton>
  )

  const addAction = canWrite ? (
    <SidebarMenuAction
      data-cy={`nav-page-plus-${node.id}`}
      aria-label="Adicionar sub-página"
      disabled={busy}
      onClick={addChild}
      showOnHover
    >
      <PlusIcon />
    </SidebarMenuAction>
  ) : null

  // Menu de contexto só faz sentido para quem escreve. A raiz do workspace não
  // pode ir para a lixeira: o engine rejeita `delete_block` num bloco sem pai.
  const row = canWrite ? (
    <ContextMenu>
      {menuButton(<ContextMenuTrigger asChild>{link}</ContextMenuTrigger>)}
      <ContextMenuContent
        data-cy={`nav-page-menu-${node.id}`}
        // Ao fechar, o Radix devolve o foco ao gatilho — o que rouba o foco do
        // diálogo de renomear que acabou de abrir e come os primeiros caracteres.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuItem
          data-cy="nav-page-rename"
          onSelect={() => setRenaming(true)}
        >
          <PencilIcon />
          Renomear
        </ContextMenuItem>
        <ContextMenuItem data-cy="nav-page-add" onSelect={addChild}>
          <PlusIcon />
          Adicionar sub-página
        </ContextMenuItem>
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
          Mover para a lixeira
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ) : (
    menuButton(link)
  )

  const body = (
    <>
      {row}
      {addAction}
      {renaming ? (
        <RenameDialog node={node} open onOpenChange={setRenaming} />
      ) : null}
    </>
  )

  if (node.children.length === 0) {
    return <SidebarMenuItem>{body}</SidebarMenuItem>
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            className="left-1 data-[state=open]:rotate-90"
            aria-label="Alternar sub-páginas"
          >
            <ChevronRightIcon />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        {body}
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.children.map((child) => (
              <PageRow key={child.id} node={child} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavPages() {
  const router = useRouter()
  const { pages, containerPageId, loading, canWrite, createTopLevelPage } =
    usePages()
  const tree = useMemo(() => buildPageTree(pages), [pages])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Páginas</SidebarGroupLabel>
      {canWrite && containerPageId ? (
        // O `+` do cabeçalho cria uma página de topo, não uma sub-página.
        <SidebarGroupAction
          data-cy="nav-pages-create"
          aria-label="Nova página"
          onClick={async () => {
            try {
              router.push(pagePath(await createTopLevelPage()))
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
          : tree.map((node) => <PageRow key={node.id} node={node} />)}
      </SidebarMenu>
    </SidebarGroup>
  )
}
