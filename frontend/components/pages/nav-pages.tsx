"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronRightIcon, FileTextIcon, PlusIcon } from "lucide-react"

import { pagePath, usePages } from "@/components/pages/page-provider"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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

interface PageNode extends PageSummary {
  children: PageNode[]
}

export function buildPageTree(pages: PageSummary[]): PageNode[] {
  const nodes = new Map(pages.map((page) => [page.id, { ...page, children: [] as PageNode[] }]))
  const roots: PageNode[] = []
  for (const page of pages) {
    const node = nodes.get(page.id)!
    const parent = page.parent_page_id ? nodes.get(page.parent_page_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function PageRow({ node }: { node: PageNode }) {
  const router = useRouter()
  const { currentPageId, canWrite, createChildPage } = usePages()
  const [open, setOpen] = useState(true)
  const [creating, setCreating] = useState(false)

  const addChild = async () => {
    setCreating(true)
    try {
      const pageId = await createChildPage(node.id)
      setOpen(true)
      router.push(pagePath(pageId))
    } finally {
      setCreating(false)
    }
  }

  const button = (
    <SidebarMenuButton
      asChild
      isActive={currentPageId === node.id}
      tooltip={node.title || UNTITLED}
    >
      <Link href={pagePath(node.id)} data-cy={`nav-page-${node.id}`}>
        <FileTextIcon />
        <span className="truncate">{node.title || UNTITLED}</span>
      </Link>
    </SidebarMenuButton>
  )

  const actions = canWrite ? (
    <SidebarMenuAction
      data-cy={`nav-page-add-${node.id}`}
      aria-label="Adicionar sub-página"
      disabled={creating}
      onClick={addChild}
      showOnHover
    >
      <PlusIcon />
    </SidebarMenuAction>
  ) : null

  if (node.children.length === 0) {
    return (
      <SidebarMenuItem>
        {button}
        {actions}
      </SidebarMenuItem>
    )
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
        {button}
        {actions}
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
  const { pages, rootPageId, loading, canWrite, createChildPage } = usePages()
  const tree = useMemo(() => buildPageTree(pages), [pages])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Páginas</SidebarGroupLabel>
      {canWrite && rootPageId ? (
        <SidebarGroupAction
          data-cy="nav-page-create"
          aria-label="Nova página"
          onClick={async () => router.push(pagePath(await createChildPage(rootPageId)))}
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
