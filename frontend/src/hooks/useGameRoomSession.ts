import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { useManagedWebSocket } from '@/hooks/useManagedWebSocket'
import { createTicketedWS } from '@/lib/ws-utils'

type RoomSession = {
  id: number
  creator_id: number | null
  opponent_id?: number | null
  status: string
}

type GameSocketAction = {
  type: string
  room_id?: number
  payload?: unknown
  [key: string]: unknown
}

interface UseGameRoomSessionOptions {
  roomId?: number | null
  token?: string | null
  room?: RoomSession | null
  currentUserId?: number
  autoJoinPendingRoom?: boolean
  joinPendingTitle?: string
  joinPendingDescription?: string
  onAction?: (action: Record<string, unknown>) => void
}

interface SendActionOptions {
  showConnectingToast?: boolean
  connectingTitle?: string
  connectingDescription?: string
}

export function useGameRoomSession({
  roomId,
  token,
  room,
  currentUserId,
  autoJoinPendingRoom = true,
  joinPendingTitle = 'Connecting...',
  joinPendingDescription = 'Joining the match as soon as the game socket is ready.',
  onAction,
}: UseGameRoomSessionOptions) {
  const previousTokenRef = useRef<string | null>(null)
  const previousRoomIdRef = useRef<number | null | undefined>(roomId)
  const onActionRef = useRef(onAction)
  const shouldAutoJoinRef = useRef(false)
  const hasJoinedRef = useRef(false)
  const allowLeaveOnUnmountRef = useRef(false)
  const isParticipantRef = useRef(false)

  useEffect(() => {
    onActionRef.current = onAction
  }, [onAction])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      allowLeaveOnUnmountRef.current = true
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!room || !currentUserId) {
      isParticipantRef.current = false
      return
    }
    isParticipantRef.current =
      room.creator_id === currentUserId || room.opponent_id === currentUserId
  }, [room, currentUserId])

  const wsEnabled = !!roomId && !!token

  const { wsRef, connectionState, reconnect, setPlannedReconnect } =
    useManagedWebSocket({
      enabled: wsEnabled,
      createSocket: async () => {
        if (!roomId) {
          throw new Error('missing game room id')
        }
        return createTicketedWS({
          path: `/api/ws/game?room_id=${roomId}`,
        })
      },
      onOpen: ws => {
        // Recover join intent after reconnect — only if the join
        // hasn't been sent yet. Re-sending after a successful join
        // causes "Game already started" errors on every reconnect.
        if (
          roomId &&
          shouldAutoJoinRef.current &&
          !hasJoinedRef.current &&
          ws.readyState === WebSocket.OPEN
        ) {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              room_id: roomId,
            })
          )
          hasJoinedRef.current = true
          shouldAutoJoinRef.current = false
        }
      },
      onMessage: (_ws, event) => {
        try {
          const action = JSON.parse(event.data) as Record<string, unknown>
          onActionRef.current?.(action)
        } catch (error) {
          console.error('Failed to parse game socket message:', error)
        }
      },
      onError: ws => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close()
        }
      },
      reconnectDelaysMs: [2000, 5000, 10000],
    })

  // When roomId changes (e.g. "Play Again" navigates to a new room),
  // reset join tracking and reconnect the WebSocket so it points at the
  // new room's endpoint.  Without this the old socket stays open on the
  // previous room and auto-join for the new room is silently skipped.
  useEffect(() => {
    const prevId = previousRoomIdRef.current
    previousRoomIdRef.current = roomId

    if (prevId != null && roomId != null && prevId !== roomId) {
      hasJoinedRef.current = false
      shouldAutoJoinRef.current = false
      setPlannedReconnect(true)
      reconnect(true)
    }
  }, [roomId, reconnect, setPlannedReconnect])

  const isSocketReady = connectionState === 'connected'

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable wsRef.current is read intentionally at call time
  const sendJoinNow = useCallback(() => {
    if (
      !roomId ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return false
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'join_room',
        room_id: roomId,
      })
    )
    hasJoinedRef.current = true
    shouldAutoJoinRef.current = false
    return true
  }, [roomId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable wsRef.current is read intentionally at call time
  const sendAction = useCallback(
    (action: GameSocketAction, options?: SendActionOptions) => {
      const showConnectingToast = options?.showConnectingToast ?? true
      const connectingTitle = options?.connectingTitle ?? 'Connecting...'
      const connectingDescription =
        options?.connectingDescription ??
        'Game socket is not ready yet. Please try again in a second.'

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        if (showConnectingToast) {
          toast.error(connectingTitle, {
            description: connectingDescription,
          })
        }
        return false
      }

      const message = {
        ...action,
        room_id: action.room_id ?? roomId,
      }
      wsRef.current.send(JSON.stringify(message))
      return true
    },
    [roomId]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable wsRef.current is read intentionally at call time
  const joinRoom = useCallback(() => {
    if (!roomId) return false

    if (
      !isSocketReady ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      shouldAutoJoinRef.current = true
      toast.message(joinPendingTitle, {
        description: joinPendingDescription,
      })
      return false
    }

    if (hasJoinedRef.current) return true
    return sendJoinNow()
  }, [
    isSocketReady,
    joinPendingDescription,
    joinPendingTitle,
    roomId,
    sendJoinNow,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable wsRef.current is read intentionally at call time
  useEffect(() => {
    if (!autoJoinPendingRoom || !room || !currentUserId) {
      shouldAutoJoinRef.current = false
      return
    }

    if (
      room.status === 'pending' &&
      room.creator_id !== currentUserId &&
      !hasJoinedRef.current
    ) {
      shouldAutoJoinRef.current = true
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendJoinNow()
      }
      return
    }

    shouldAutoJoinRef.current = false
  }, [autoJoinPendingRoom, room, currentUserId, sendJoinNow])

  useEffect(() => {
    if (!wsEnabled) {
      previousTokenRef.current = token ?? null
      return
    }

    const previousToken = previousTokenRef.current
    const currentToken = token ?? null
    previousTokenRef.current = currentToken

    if (!previousToken || !currentToken || previousToken === currentToken) {
      return
    }

    setPlannedReconnect(true)
    reconnect(true)
  }, [wsEnabled, token, reconnect, setPlannedReconnect])

  useEffect(() => {
    if (!roomId || !token) return

    const leaveWithKeepalive = () => {
      if (!isParticipantRef.current) return
      void fetch(`/api/games/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        keepalive: true,
      })
    }

    const handleBeforeUnload = () => {
      leaveWithKeepalive()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (!allowLeaveOnUnmountRef.current || !isParticipantRef.current) return
      void apiClient.leaveGameRoom(roomId).catch((error: unknown) => {
        if (error instanceof Error && error.message.includes('403')) return
        console.error('Failed to leave room cleanly:', error)
      })
    }
  }, [roomId, token])

  return {
    isSocketReady,
    sendAction,
    joinRoom,
    wsRef,
  }
}
