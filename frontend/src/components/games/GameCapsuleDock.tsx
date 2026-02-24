import { useQueries, useQueryClient } from '@tanstack/react-query'
import { CircleDot, Gamepad2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiClient } from '@/api/client'
import type { GameRoom } from '@/api/types'
import { Button } from '@/components/ui/button'
import { gameKeys } from '@/hooks'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import {
  GAME_ROOM_REALTIME_EVENT,
  type GameRoomRealtimeUpdateDetail,
} from '@/lib/game-realtime-events'
import {
  GAME_ROOM_PRESENCE_EVENT,
  getResumableGameRooms,
  type ResumableGameRoom,
  type ResumableGameStatus,
  removeResumableGameRoom,
  upsertResumableGameRoom,
} from '@/lib/game-room-presence'
import {
  buildGameRoomPath,
  getGameTypeLabel,
  isSupportedGameType,
  parseGameRoomPath,
  type SupportedGameType,
} from '@/lib/game-routes'
import { cn } from '@/lib/utils'

type RoomMeta = {
  status: ResumableGameStatus
  isMyTurn: boolean
}

function isParticipant(room: GameRoom, userId: number) {
  return room.creator_id === userId || room.opponent_id === userId
}

function createRoomSignature(room: GameRoom) {
  return `${room.status}|${room.next_turn_id}|${room.current_state}`
}

function normalizeRoomMeta(room: GameRoom, userId: number): RoomMeta | null {
  if (room.status !== 'pending' && room.status !== 'active') {
    return null
  }
  return {
    status: room.status,
    isMyTurn: room.status === 'active' && room.next_turn_id === userId,
  }
}

function shouldPruneRoomForQueryError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 401 || error.status === 403 || error.status === 404
  }
  return false
}

export function GameCapsuleDock() {
  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const userId = currentUser?.id
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeGameRoute = parseGameRoomPath(location.pathname)

  const [trackedRooms, setTrackedRooms] = useState<ResumableGameRoom[]>([])
  const [attentionByRoom, setAttentionByRoom] = useState<
    Record<number, boolean>
  >({})
  const [leavingRoomId, setLeavingRoomId] = useState<number | null>(null)
  const previousSignaturesRef = useRef<Record<number, string>>({})

  const refreshTrackedRooms = useCallback(() => {
    setTrackedRooms(getResumableGameRooms(userId))
  }, [userId])

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setTrackedRooms([])
      setAttentionByRoom({})
      previousSignaturesRef.current = {}
      return
    }
    refreshTrackedRooms()
  }, [isAuthenticated, userId, refreshTrackedRooms])

  useEffect(() => {
    if (!isAuthenticated || !userId) return

    const onPresenceUpdated = (
      event: Event | CustomEvent<{ userId?: number }>
    ) => {
      const customEvent = event as CustomEvent<{ userId?: number }>
      if (!customEvent.detail || customEvent.detail.userId === userId) {
        refreshTrackedRooms()
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('sanctum:resumable-game-rooms:')) {
        refreshTrackedRooms()
      }
    }

    window.addEventListener(
      GAME_ROOM_PRESENCE_EVENT,
      onPresenceUpdated as EventListener
    )
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener(
        GAME_ROOM_PRESENCE_EVENT,
        onPresenceUpdated as EventListener
      )
      window.removeEventListener('storage', onStorage)
    }
  }, [isAuthenticated, userId, refreshTrackedRooms])

  useEffect(() => {
    if (!isAuthenticated || !userId) return

    const onGameRoomUpdated = (
      event: Event | CustomEvent<GameRoomRealtimeUpdateDetail>
    ) => {
      const customEvent = event as CustomEvent<GameRoomRealtimeUpdateDetail>
      const roomId = customEvent.detail?.roomId

      if (
        typeof roomId === 'number' &&
        trackedRooms.some(room => room.roomId === roomId)
      ) {
        void queryClient.invalidateQueries({
          queryKey: ['gameRoomCapsule', roomId],
        })
        return
      }

      if (roomId == null) {
        void queryClient.invalidateQueries({
          queryKey: ['gameRoomCapsule'],
        })
      }
    }

    window.addEventListener(
      GAME_ROOM_REALTIME_EVENT,
      onGameRoomUpdated as EventListener
    )

    return () => {
      window.removeEventListener(
        GAME_ROOM_REALTIME_EVENT,
        onGameRoomUpdated as EventListener
      )
    }
  }, [isAuthenticated, queryClient, trackedRooms, userId])

  const roomQueries = useQueries({
    queries: trackedRooms.map(room => ({
      queryKey: ['gameRoomCapsule', room.roomId],
      queryFn: () => apiClient.getGameRoom(room.roomId),
      enabled: isAuthenticated && !!userId,
      staleTime: 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    })),
  })

  const queryResultsByRoom = useMemo(() => {
    return trackedRooms.map((tracked, index) => ({
      tracked,
      query: roomQueries[index],
    }))
  }, [trackedRooms, roomQueries])

  useEffect(() => {
    if (!userId) return

    for (const { tracked, query } of queryResultsByRoom) {
      if (query.status === 'error') {
        if (shouldPruneRoomForQueryError(query.error)) {
          removeResumableGameRoom(userId, tracked.roomId)
          delete previousSignaturesRef.current[tracked.roomId]
        }
        continue
      }

      if (query.status !== 'success' || !query.data) {
        continue
      }

      const room = query.data as GameRoom
      if (!isSupportedGameType(room.type) || !isParticipant(room, userId)) {
        removeResumableGameRoom(userId, tracked.roomId)
        delete previousSignaturesRef.current[tracked.roomId]
        continue
      }

      const normalized = normalizeRoomMeta(room, userId)
      if (!normalized) {
        removeResumableGameRoom(userId, tracked.roomId)
        delete previousSignaturesRef.current[tracked.roomId]
        continue
      }

      if (tracked.type !== room.type || tracked.status !== normalized.status) {
        upsertResumableGameRoom(userId, {
          roomId: room.id,
          type: room.type,
          status: normalized.status,
        })
      }

      const signature = createRoomSignature(room)
      const previous = previousSignaturesRef.current[room.id]
      const isCurrentRoom = activeGameRoute?.roomId === room.id

      if (previous && previous !== signature && !isCurrentRoom) {
        setAttentionByRoom(current => ({
          ...current,
          [room.id]: true,
        }))
      }

      previousSignaturesRef.current[room.id] = signature
    }
  }, [queryResultsByRoom, userId, activeGameRoute?.roomId])

  useEffect(() => {
    if (!activeGameRoute) return
    setAttentionByRoom(current => {
      if (!current[activeGameRoute.roomId]) return current
      const next = { ...current }
      delete next[activeGameRoute.roomId]
      return next
    })
  }, [activeGameRoute])

  const roomMetaById = useMemo(() => {
    const meta = new Map<number, RoomMeta>()
    if (!userId) return meta

    for (const { tracked, query } of queryResultsByRoom) {
      if (query.status !== 'success' || !query.data) {
        meta.set(tracked.roomId, {
          status: tracked.status,
          isMyTurn: false,
        })
        continue
      }

      const room = query.data as GameRoom
      const normalized = normalizeRoomMeta(room, userId)
      if (!normalized) continue
      meta.set(tracked.roomId, normalized)
    }
    return meta
  }, [queryResultsByRoom, userId])

  const visibleRooms = useMemo(() => {
    return trackedRooms.filter(room => room.roomId !== activeGameRoute?.roomId)
  }, [trackedRooms, activeGameRoute?.roomId])

  const clearAttention = useCallback((roomId: number) => {
    setAttentionByRoom(current => {
      if (!current[roomId]) return current
      const next = { ...current }
      delete next[roomId]
      return next
    })
  }, [])

  const handleResume = useCallback(
    (type: SupportedGameType, roomId: number) => {
      clearAttention(roomId)
      navigate(buildGameRoomPath(type, roomId))
    },
    [clearAttention, navigate]
  )

  const handleExit = useCallback(
    async (roomId: number) => {
      if (!userId) return
      setLeavingRoomId(roomId)
      try {
        await apiClient.leaveGameRoom(roomId)
        removeResumableGameRoom(userId, roomId)
        setAttentionByRoom(current => {
          if (!current[roomId]) return current
          const next = { ...current }
          delete next[roomId]
          return next
        })
        delete previousSignaturesRef.current[roomId]
        await queryClient.invalidateQueries({
          queryKey: gameKeys.roomsActive(),
        })
        toast.success('Game exited')
      } catch (error) {
        console.error('Failed to exit game room', error)
        toast.error('Unable to exit game')
      } finally {
        setLeavingRoomId(null)
      }
    },
    [queryClient, userId]
  )

  if (!isAuthenticated || !userId || visibleRooms.length === 0) {
    return null
  }

  return (
    <div className='pointer-events-none fixed bottom-20 right-3 z-55 flex max-w-[min(92vw,24rem)] flex-col gap-2 md:bottom-6 md:right-6'>
      <style>
        {`@keyframes game-capsule-shake {
            0% { transform: translateX(0); }
            25% { transform: translateX(-2px); }
            50% { transform: translateX(2px); }
            75% { transform: translateX(-1px); }
            100% { transform: translateX(0); }
          }`}
      </style>
      {visibleRooms.map(room => {
        const meta = roomMetaById.get(room.roomId)
        const status = meta?.status ?? room.status
        const isMyTurn = meta?.isMyTurn ?? false
        const hasAttention = !!attentionByRoom[room.roomId]
        const isLeaving = leavingRoomId === room.roomId

        return (
          <div
            key={`${room.type}-${room.roomId}`}
            className={cn(
              'pointer-events-auto flex items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur-md transition-all',
              hasAttention
                ? 'border-emerald-400/70 bg-emerald-500/20 shadow-emerald-500/25'
                : 'border-border/70 bg-background/92'
            )}
          >
            <button
              type='button'
              onClick={() => handleResume(room.type, room.roomId)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5 text-left transition-colors hover:bg-muted/60',
                hasAttention &&
                  'animate-[game-capsule-shake_0.45s_ease-in-out_2]'
              )}
            >
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  room.type === 'connect4'
                    ? 'bg-blue-500/15 text-blue-500'
                    : 'bg-emerald-500/15 text-emerald-500'
                )}
              >
                <Gamepad2 className='h-4 w-4' />
              </div>
              <div className='min-w-0'>
                <p className='truncate text-xs font-black uppercase tracking-tight'>
                  {getGameTypeLabel(room.type)}
                </p>
                <p
                  className={cn(
                    'truncate text-[10px] font-semibold uppercase text-muted-foreground',
                    (hasAttention || isMyTurn) && 'text-emerald-500'
                  )}
                >
                  {status === 'pending'
                    ? 'Waiting for opponent'
                    : isMyTurn
                      ? 'Your turn'
                      : 'Match in progress'}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide',
                  hasAttention || isMyTurn
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <CircleDot className='h-2.5 w-2.5' />#{room.roomId}
              </span>
            </button>

            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
              onClick={() => void handleExit(room.roomId)}
              disabled={isLeaving}
              aria-label='Exit game'
            >
              <X className='h-4 w-4' />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
