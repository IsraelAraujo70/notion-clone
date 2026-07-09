"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { PresencePeer } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  connectWorkspaceSocket,
  type AppliedOpEvent,
} from "@/lib/sync/workspace-socket"

export type PresenceSocket = {
  peers: PresencePeer[]
  pagePeers: PresencePeer[]
  blockPresence: Map<string, PresencePeer[]>
  sendPresence: (pageId: string | null, focusedBlockId: string | null) => void
  close: () => void
}

/**
 * Mantém o mapa de presence do workspace e filtra por página.
 * O socket de ops é o mesmo — este hook só é útil quando o caller
 * não usa connectWorkspaceSocket diretamente.
 */
export function useWorkspacePresence(
  workspaceId: string | null,
  pageId: string | null,
  onOp: (event: AppliedOpEvent) => void,
  onReady?: () => void,
  onStatus?: (status: "connecting" | "open" | "closed") => void
) {
  const { token, user } = useAuth()
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const sendRef = useRef<
    (pageId: string | null, focusedBlockId: string | null) => void
  >(() => {})
  const onOpRef = useRef(onOp)
  const onReadyRef = useRef(onReady)
  const onStatusRef = useRef(onStatus)

  useEffect(() => {
    onOpRef.current = onOp
  }, [onOp])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    onStatusRef.current = onStatus
  }, [onStatus])

  useEffect(() => {
    if (!token || !workspaceId) return
    let active = true
    queueMicrotask(() => {
      if (active) setPeers([])
    })

    const socket = connectWorkspaceSocket(workspaceId, token, {
      onOp: (event) => {
        if (active) onOpRef.current(event)
      },
      onHello: () => {
        if (active) onReadyRef.current?.()
      },
      onStatus: (status) => {
        if (active) onStatusRef.current?.(status)
      },
      onPresenceSnapshot: (next) => {
        if (active) setPeers(next)
      },
      onPresenceUpdate: (peer) => {
        if (!active) return
        setPeers((current) => {
          const without = current.filter(
            (p) => p.connection_id !== peer.connection_id
          )
          return [...without, peer]
        })
      },
      onPresenceLeave: (connectionId) => {
        if (!active) return
        setPeers((current) =>
          current.filter((p) => p.connection_id !== connectionId)
        )
      },
    })
    sendRef.current = socket.sendPresence

    return () => {
      active = false
      socket.close()
    }
  }, [token, workspaceId])

  const sendPresence = useCallback(
    (nextPageId: string | null, focusedBlockId: string | null) => {
      sendRef.current(nextPageId, focusedBlockId)
    },
    []
  )

  useEffect(() => {
    if (!pageId) return
    sendPresence(pageId, null)
  }, [pageId, sendPresence])

  const pagePeers = useMemo(() => {
    if (!pageId) return []
    const byUser = new Map<string, PresencePeer>()
    for (const peer of peers) {
      if (peer.page_id !== pageId) continue
      if (user && peer.user_id === user.id) continue
      const existing = byUser.get(peer.user_id)
      if (!existing || peer.last_seen > existing.last_seen) {
        byUser.set(peer.user_id, peer)
      }
    }
    return [...byUser.values()]
  }, [pageId, peers, user])

  const blockPresence = useMemo(() => {
    const map = new Map<string, PresencePeer[]>()
    for (const peer of pagePeers) {
      if (!peer.focused_block_id) continue
      const list = map.get(peer.focused_block_id) ?? []
      list.push(peer)
      map.set(peer.focused_block_id, list)
    }
    return map
  }, [pagePeers])

  return { peers, pagePeers, blockPresence, sendPresence }
}
