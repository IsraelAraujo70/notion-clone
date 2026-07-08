"use client"

import type { ComponentType } from "react"
import Link from "next/link"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: readonly {
    id: string
    title: string
    href: string
    icon: ComponentType
  }[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Páginas</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive tooltip={item.title}>
              <Link href={item.href} data-cy={`nav-${item.id}`}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
