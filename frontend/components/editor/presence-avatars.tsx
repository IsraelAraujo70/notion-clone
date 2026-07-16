"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PageEditor, PresencePeer } from "@/lib/api"
import { useI18n } from "@/lib/i18n/i18n-provider"

export type PresenceAvatarItem = {
  user_id: string
  display_name: string
  avatar_url?: string | null
  color?: string
  live?: boolean
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function mergePresenceAvatars(
  live: PresencePeer[],
  recent: PageEditor[],
  max = 3
): { visible: PresenceAvatarItem[]; overflow: number } {
  const items: PresenceAvatarItem[] = []
  const seen = new Set<string>()

  for (const peer of live) {
    if (seen.has(peer.user_id)) continue
    seen.add(peer.user_id)
    items.push({
      user_id: peer.user_id,
      display_name: peer.display_name,
      avatar_url: peer.avatar_url,
      color: peer.color,
      live: true,
    })
  }

  for (const editor of recent) {
    if (seen.has(editor.user_id)) continue
    seen.add(editor.user_id)
    items.push({
      user_id: editor.user_id,
      display_name: editor.display_name,
      avatar_url: editor.avatar_url,
      live: false,
    })
  }

  const visible = items.slice(0, max)
  return { visible, overflow: Math.max(0, items.length - max) }
}

export function PresenceAvatarStack({
  live,
  recent,
  max = 3,
}: {
  live: PresencePeer[]
  recent: PageEditor[]
  max?: number
}) {
  const { t } = useI18n()
  const { visible, overflow } = mergePresenceAvatars(live, recent, max)
  if (visible.length === 0) return null

  return (
    <TooltipProvider>
      <AvatarGroup className="-space-x-2" data-cy="presence-avatars">
        {visible.map((item) => (
          <Tooltip key={item.user_id}>
            <TooltipTrigger asChild>
              <Avatar
                size="sm"
                className="ring-2 ring-background"
                style={
                  item.live && item.color
                    ? { boxShadow: `0 0 0 2px ${item.color}` }
                    : undefined
                }
              >
                {item.avatar_url ? (
                  <AvatarImage src={item.avatar_url} alt={item.display_name} />
                ) : null}
                <AvatarFallback>{initials(item.display_name)}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              {item.display_name}
              {item.live ? ` · ${t("online")}` : ""}
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 ? <AvatarGroupCount>+{overflow}</AvatarGroupCount> : null}
      </AvatarGroup>
    </TooltipProvider>
  )
}

export function BlockPresenceAvatar({ peers }: { peers: PresencePeer[] }) {
  if (peers.length === 0) return null
  const peer = peers[0]
  // Gutter esquerdo da linha (fora do texto, ao lado do handle) — estilo Notion.
  return (
    <div
      className="pointer-events-none absolute top-1/2 -left-6 z-10 -translate-y-1/2"
      data-cy={`block-presence-${peer.focused_block_id}`}
    >
      <Avatar
        size="sm"
        className="size-5 ring-2 ring-background"
        style={{ boxShadow: `0 0 0 2px ${peer.color}` }}
        title={peer.display_name}
      >
        {peer.avatar_url ? (
          <AvatarImage src={peer.avatar_url} alt={peer.display_name} />
        ) : null}
        <AvatarFallback className="text-[9px]">
          {initials(peer.display_name)}
        </AvatarFallback>
      </Avatar>
    </div>
  )
}
