"use client"

import type { ComponentProps } from "react"
import { SearchIcon, Trash2Icon } from "lucide-react"

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
            <SidebarMenuButton className="font-medium">
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-4"
                  fill="none"
                >
                  <path
                    d="M5.75 18.25V5.75h7.5c3.2 0 5 1.55 5 4.1 0 1.62-.82 2.9-2.28 3.55l2.53 4.85h-3.2l-2.08-4.15H8.7v4.15H5.75Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.7 11.7h4.12c1.5 0 2.35-.62 2.35-1.76 0-1.1-.86-1.74-2.35-1.74H8.7v3.5Z"
                    fill="currentColor"
                  />
                  <path
                    d="M8.7 18.25v-4.1h3.68"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="truncate">reason</span>
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
