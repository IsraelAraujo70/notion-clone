"use client"

import type { ComponentProps } from "react"
import { SearchIcon, Trash2Icon } from "lucide-react"
import Image from "next/image"

import { useCommandMenu } from "@/components/command/organisms/command-menu-provider"
import { dashboardNavItems } from "@/components/dashboard/nav-items"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
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

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-9">
              <Image
                src="/reason-logo-sidebar-expanded.svg"
                alt="reason"
                width={110}
                height={24}
                className="h-7 w-auto group-data-[collapsible=icon]:hidden"
                priority
              />
              <Image
                src="/reason-logo-sidebar-collapsed.svg"
                alt="reason"
                width={24}
                height={24}
                className="hidden size-6 group-data-[collapsible=icon]:block"
                priority
              />
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
                <SidebarMenuButton disabled tooltip="Lixeira">
                  <Trash2Icon />
                  <span>Lixeira</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavMain items={dashboardNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
