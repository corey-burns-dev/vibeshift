import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import type { GameRoom } from '@/api/types'
import { getCurrentUser } from '@/hooks'
import { useAuthToken } from '@/hooks/useAuth'
import { useGameChat } from '@/hooks/useGameChat'
import { useGameRoomSession } from '@/hooks/useGameRoomSession'
import { useResumableGameRoomPresence } from '@/hooks/useResumableGameRoomPresence'
import { getAvatarUrl } from '@/lib/chat-utils'
import { playVictoryJingle } from '@/lib/game-audio'
import { VICTORY_BLAST_DURATION_MS } from '@/lib/game-effects'
import {
  GAME_ROOM_REALTIME_EVENT,
  type GameRoomRealtimeUpdateDetail,
} from '@/lib/game-realtime-events'
import { removeResumableGameRoom } from '@/lib/game-room-presence'
import { buildGameRoomPath, type SupportedGameType } from '@/lib/game-routes'

type GameStatus = 'pending' | 'active' | 'finished' | 'cancelled'

type GameSocketActionType = 'game_state' | 'game_started'

type GameSocketPayload = Record<string, unknown>

type ActiveGameRoom = {
  id: number
  status: string
  creator_id: number | null
  opponent_id?: number | null
}

export interface GameRoomCoreState {
  status: GameStatus
  winner_id: number | null
  next_turn: number
  is_draw: boolean
}

export interface UseGameRoomCoreOptions {
  roomId: number | null
  roomIdParam: string | undefined
  gameType: SupportedGameType
  gameLabel: string
  opponentPlaceholder?: string
  gameStartedTitle?: string
  gameStartedDescription?: string
  onBoardAction: (
    type: GameSocketActionType,
    payload: GameSocketPayload
  ) => void
}

function parseStatus(raw: unknown, fallback: GameStatus): GameStatus {
  if (
    raw === 'pending' ||
    raw === 'active' ||
    raw === 'finished' ||
    raw === 'cancelled'
  ) {
    return raw
  }
  return fallback
}

function buildCancelledState(
  prev: GameRoomCoreState | null
): GameRoomCoreState {
  if (!prev) {
    return {
      status: 'cancelled',
      winner_id: null,
      next_turn: 0,
      is_draw: false,
    }
  }

  return {
    ...prev,
    status: 'cancelled',
    winner_id: null,
    next_turn: 0,
    is_draw: false,
  }
}

export function useGameRoomCore({
  roomId,
  roomIdParam,
  gameType,
  gameLabel,
  opponentPlaceholder = 'BOT',
  gameStartedTitle,
  gameStartedDescription = 'Your opponent has joined.',
  onBoardAction,
}: UseGameRoomCoreOptions) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const token = useAuthToken()
  const queryClient = useQueryClient()

  const [coreState, setCoreState] = useState<GameRoomCoreState | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [showVictoryBlast, setShowVictoryBlast] = useState(false)
  const [showDefeatBlast, setShowDefeatBlast] = useState(false)
  const [showRematchDialog, setShowRematchDialog] = useState(false)
  const [isStartingRematch, setIsStartingRematch] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [isLeavingGame, setIsLeavingGame] = useState(false)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const didShowEndGameUiRef = useRef(false)
  const victoryTimeoutRef = useRef<number | null>(null)
  const defeatTimeoutRef = useRef<number | null>(null)
  const rematchDialogTimeoutRef = useRef<number | null>(null)
  const didShowGameStartedToastRef = useRef(false)
  const movePendingRef = useRef(false)
  const didHandleCancellationRef = useRef(false)
  const localLeaveRequestedRef = useRef(false)
  const onBoardActionRef = useRef(onBoardAction)

  useEffect(() => {
    onBoardActionRef.current = onBoardAction
  }, [onBoardAction])

  const { data: room, isError } = useQuery({
    queryKey: ['gameRoom', roomIdParam],
    queryFn: () => apiClient.getGameRoom(Number(roomIdParam)),
    enabled: !!roomIdParam,
  })

  const { messages, addMessage } = useGameChat(roomId)

  useEffect(() => {
    if (isError) {
      toast.error('Game not found')
      navigate('/games')
    }
  }, [isError, navigate])

  useEffect(() => {
    if (!roomId || Number.isNaN(roomId)) {
      didShowGameStartedToastRef.current = false
      didHandleCancellationRef.current = false
      localLeaveRequestedRef.current = false
      return
    }

    didShowGameStartedToastRef.current = false
    didHandleCancellationRef.current = false
    localLeaveRequestedRef.current = false
  }, [roomId])

  const handleRoomCancelled = useCallback(
    (message?: string) => {
      if (!roomId || Number.isNaN(roomId) || didHandleCancellationRef.current) {
        return
      }

      didHandleCancellationRef.current = true
      movePendingRef.current = false
      setCoreState(prev => buildCancelledState(prev))

      if (currentUser?.id) {
        removeResumableGameRoom(currentUser.id, roomId)
      }

      if (localLeaveRequestedRef.current) {
        return
      }

      toast.error('Game cancelled', {
        description: message || 'Your opponent left the room.',
      })
      navigate('/games')
    },
    [currentUser?.id, navigate, roomId]
  )

  useEffect(() => {
    if (!room) return

    setCoreState({
      status: parseStatus(room.status, 'pending'),
      winner_id: room.winner_id ?? null,
      next_turn: room.next_turn_id,
      is_draw: room.is_draw,
    })
  }, [room])

  useEffect(() => {
    if (!roomId || Number.isNaN(roomId)) return

    const onGameRoomUpdated = (
      event: Event | CustomEvent<GameRoomRealtimeUpdateDetail>
    ) => {
      const customEvent = event as CustomEvent<GameRoomRealtimeUpdateDetail>
      const updatedRoomId = customEvent.detail?.roomId
      if (updatedRoomId != null && updatedRoomId !== roomId) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: ['gameRoom', roomIdParam],
      })
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
  }, [queryClient, roomId, roomIdParam])

  useEffect(() => {
    if (room?.status === 'cancelled') {
      handleRoomCancelled('Your opponent left the room.')
    }
  }, [room?.status, handleRoomCancelled])

  const handleGameSocketAction = useCallback(
    (action: Record<string, unknown>) => {
      const actionType = typeof action.type === 'string' ? action.type : ''
      const payload =
        action.payload && typeof action.payload === 'object'
          ? (action.payload as GameSocketPayload)
          : {}

      switch (actionType) {
        case 'game_state':
        case 'game_started': {
          if (actionType === 'game_state') {
            movePendingRef.current = false
          }

          setCoreState(prev => ({
            status: parseStatus(payload.status, prev?.status ?? 'active'),
            winner_id:
              typeof payload.winner_id === 'number'
                ? payload.winner_id
                : payload.winner_id === null
                  ? null
                  : (prev?.winner_id ?? null),
            next_turn:
              typeof payload.next_turn === 'number'
                ? payload.next_turn
                : (prev?.next_turn ?? 0),
            is_draw:
              typeof payload.is_draw === 'boolean'
                ? payload.is_draw
                : (prev?.is_draw ?? false),
          }))

          onBoardActionRef.current(actionType, payload)

          void queryClient.invalidateQueries({
            queryKey: ['gameRoom', roomIdParam],
          })

          if (
            actionType === 'game_started' &&
            !didShowGameStartedToastRef.current
          ) {
            didShowGameStartedToastRef.current = true
            toast.success(gameStartedTitle ?? `${gameLabel} Started!`, {
              description: gameStartedDescription,
            })
          }

          break
        }
        case 'game_cancelled': {
          const message =
            typeof payload.message === 'string'
              ? payload.message
              : 'A player left this room.'
          void queryClient.invalidateQueries({
            queryKey: ['gameRoom', roomIdParam],
          })
          handleRoomCancelled(message)
          break
        }
        case 'chat': {
          const userId = typeof action.user_id === 'number' ? action.user_id : 0
          const username =
            typeof payload.username === 'string' ? payload.username : 'Opponent'
          const text = typeof payload.text === 'string' ? payload.text : ''
          if (!text) return
          addMessage({ user_id: userId, username, text })
          break
        }
        case 'error': {
          movePendingRef.current = false
          const message =
            typeof payload.message === 'string'
              ? payload.message
              : 'Unknown error'
          toast.error('Game Error', {
            description:
              message === 'You are the creator'
                ? 'Open the room from a different account to join as opponent.'
                : message,
          })
          break
        }
      }
    },
    [
      addMessage,
      gameLabel,
      gameStartedDescription,
      gameStartedTitle,
      handleRoomCancelled,
      queryClient,
      roomIdParam,
    ]
  )

  const gameSession = useGameRoomSession({
    roomId: roomId && !Number.isNaN(roomId) ? roomId : null,
    token,
    room: room
      ? {
          id: room.id,
          creator_id: room.creator_id ?? null,
          opponent_id: room.opponent_id ?? null,
          status: room.status,
        }
      : null,
    currentUserId: currentUser?.id,
    onAction: handleGameSocketAction,
    onSocketOpen: () => {
      movePendingRef.current = false
      void queryClient.invalidateQueries({
        queryKey: ['gameRoom', roomIdParam],
      })
    },
  })

  const isCreator = currentUser?.id === room?.creator_id
  const isOpponent = currentUser?.id === room?.opponent_id
  const isPlayer = isCreator || isOpponent
  const canJoin =
    !!room &&
    !!coreState &&
    !isPlayer &&
    room.status === 'pending' &&
    coreState.status === 'pending'
  const isMyTurn =
    coreState?.status === 'active' && coreState.next_turn === currentUser?.id
  const didIWin =
    !!coreState && !coreState.is_draw && coreState.winner_id === currentUser?.id

  const playerOneName = room?.creator?.username ?? 'Deleted User'
  const playerTwoName =
    room?.opponent?.username ||
    (coreState?.status === 'pending' ? 'WAITING...' : opponentPlaceholder)
  const playerOneAvatar =
    room?.creator?.avatar || getAvatarUrl(playerOneName, 80)
  const playerTwoAvatar = room?.opponent?.avatar
    ? room.opponent.avatar
    : room?.opponent?.username
      ? getAvatarUrl(room.opponent.username, 80)
      : ''

  useResumableGameRoomPresence({
    userId: currentUser?.id,
    roomId,
    type: gameType,
    status: coreState?.status,
    isParticipant: isCreator || isOpponent,
  })

  useEffect(() => {
    if (canJoin) {
      void gameSession.joinRoom()
    }
  }, [canJoin, gameSession])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when new messages arrive
  useEffect(() => {
    const chatContainer = chatScrollRef.current
    if (!chatContainer) return

    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length])

  const triggerVictoryBlast = useCallback(() => {
    setShowVictoryBlast(true)
    playVictoryJingle()

    if (victoryTimeoutRef.current !== null) {
      window.clearTimeout(victoryTimeoutRef.current)
    }

    victoryTimeoutRef.current = window.setTimeout(() => {
      setShowVictoryBlast(false)
    }, VICTORY_BLAST_DURATION_MS)
  }, [])

  const triggerDefeatBlast = useCallback(() => {
    setShowDefeatBlast(true)

    if (defeatTimeoutRef.current !== null) {
      window.clearTimeout(defeatTimeoutRef.current)
    }

    defeatTimeoutRef.current = window.setTimeout(() => {
      setShowDefeatBlast(false)
    }, VICTORY_BLAST_DURATION_MS)
  }, [])

  useEffect(() => {
    if (!coreState) return

    if (coreState.status === 'finished' && !didShowEndGameUiRef.current) {
      didShowEndGameUiRef.current = true

      if (!coreState.is_draw && coreState.winner_id === currentUser?.id) {
        triggerVictoryBlast()
        if (rematchDialogTimeoutRef.current !== null) {
          window.clearTimeout(rematchDialogTimeoutRef.current)
        }

        rematchDialogTimeoutRef.current = window.setTimeout(() => {
          setShowRematchDialog(true)
        }, VICTORY_BLAST_DURATION_MS)
      } else if (!coreState.is_draw) {
        triggerDefeatBlast()
        if (rematchDialogTimeoutRef.current !== null) {
          window.clearTimeout(rematchDialogTimeoutRef.current)
        }

        rematchDialogTimeoutRef.current = window.setTimeout(() => {
          setShowRematchDialog(true)
        }, VICTORY_BLAST_DURATION_MS)
      } else {
        setShowRematchDialog(true)
      }

      return
    }

    if (coreState.status === 'active' || coreState.status === 'pending') {
      didShowEndGameUiRef.current = false
    }
  }, [coreState, currentUser?.id, triggerDefeatBlast, triggerVictoryBlast])

  useEffect(() => {
    return () => {
      if (victoryTimeoutRef.current !== null) {
        window.clearTimeout(victoryTimeoutRef.current)
      }
      if (defeatTimeoutRef.current !== null) {
        window.clearTimeout(defeatTimeoutRef.current)
      }
      if (rematchDialogTimeoutRef.current !== null) {
        window.clearTimeout(rematchDialogTimeoutRef.current)
      }
    }
  }, [])

  const joinGame = useCallback(() => {
    gameSession.joinRoom()
  }, [gameSession])

  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return

    const sent = gameSession.sendAction({
      type: 'chat',
      payload: {
        text: chatInput.trim(),
        username: currentUser?.username,
      },
    })

    if (!sent) return
    setChatInput('')
  }, [chatInput, currentUser?.username, gameSession])

  const handlePlayAgain = useCallback(async () => {
    if (!currentUser) return

    setIsStartingRematch(true)
    try {
      const freshRooms = (await apiClient.getActiveGameRooms(
        gameType
      )) as ActiveGameRoom[]

      const joinableRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id &&
          activeRoom.creator_id !== currentUser.id &&
          !activeRoom.opponent_id
      )

      if (joinableRoom) {
        setShowRematchDialog(false)
        navigate(buildGameRoomPath(gameType, joinableRoom.id))
        return
      }

      const myPendingRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id === currentUser.id
      )

      if (myPendingRoom) {
        setShowRematchDialog(false)
        navigate(buildGameRoomPath(gameType, myPendingRoom.id))
        return
      }

      const newRoom = await apiClient.createGameRoom(gameType)
      setShowRematchDialog(false)
      navigate(buildGameRoomPath(gameType, newRoom.id))
    } catch (error) {
      console.error('Failed to start rematch', error)
      toast.error('Could not start rematch. Please try again.')
    } finally {
      setIsStartingRematch(false)
    }
  }, [currentUser, gameType, navigate])

  const handleLeaveGame = useCallback(async () => {
    if (!roomId || !currentUser?.id) return

    localLeaveRequestedRef.current = true
    setIsLeavingGame(true)
    try {
      await apiClient.leaveGameRoom(roomId)
      removeResumableGameRoom(currentUser.id, roomId)
      navigate('/games')
    } catch (error) {
      localLeaveRequestedRef.current = false
      console.error('Failed to leave game', error)
      toast.error('Unable to leave game')
    } finally {
      setIsLeavingGame(false)
      setShowLeaveDialog(false)
    }
  }, [currentUser?.id, navigate, roomId])

  return {
    room: room as GameRoom | undefined,
    coreState,
    setCoreState,
    isSocketReady: gameSession.isSocketReady,
    sendAction: gameSession.sendAction,
    currentUserId: currentUser?.id,
    isCreator,
    isOpponent,
    isPlayer,
    isMyTurn,
    canJoin,
    didIWin,
    playerOneName,
    playerTwoName,
    playerOneAvatar,
    playerTwoAvatar,
    messages,
    chatInput,
    setChatInput,
    sendChat,
    chatScrollRef,
    showVictoryBlast,
    showDefeatBlast,
    showRematchDialog,
    setShowRematchDialog,
    isStartingRematch,
    showLeaveDialog,
    setShowLeaveDialog,
    isLeavingGame,
    joinGame,
    handlePlayAgain,
    handleLeaveGame,
    movePendingRef,
    localLeaveRequestedRef,
  }
}
