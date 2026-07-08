"use client"

import { useState, type ComponentProps } from "react"
import { SearchIcon, Trash2Icon } from "lucide-react"

import { Brand } from "@/components/atoms/brand"
import { useCommandMenu } from "@/components/command/organisms/command-menu-provider"
import { NavPages } from "@/components/pages/nav-pages"
import { pagePath, usePages } from "@/components/pages/page-provider"
import { NavUser } from "@/components/nav-user"
import { TrashDialog } from "@/components/pages/trash-dialog"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { openMenu } = useCommandMenu()
  const { rootPageId } = usePages()
  const [trashOpen, setTrashOpen] = useState(false)

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-9">
              <Brand href={rootPageId ? pagePath(rootPageId) : "/dashboard"} />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-cy="command-trigger"
                  tooltip="Buscar e navegar"
                  onClick={openMenu}
                >
                  <SearchIcon />
                  <span>Busca</span>
                  <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                    ⌘K
                  </Kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-cy="trash-trigger"
                  tooltip="Lixeira"
                  onClick={() => setTrashOpen(true)}
                >
                  <Trash2Icon />
                  <span>Lixeira</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavPages />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} />
    </Sidebar>
  )
}
