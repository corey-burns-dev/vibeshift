import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { getWsBaseUrl } from '@/lib/chat-utils'

type RoomSession = {
    creator_id: number
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
    const [isSocketReady, setIsSocketReady] = useState(false)

    const wsRef = useRef<WebSocket | null>(null)
    const onActionRef = useRef(onAction)
    const shouldAutoJoinRef = useRef(false)
    const hasJoinedRef = useRef(false)
    const allowLeaveOnUnmountRef = useRef(false)
    const isParticipantRef = useRef(false)
    const didSetConnectionErrorRef = useRef(false)

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

    const sendJoinNow = useCallback(() => {
        if (!roomId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
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

    const joinRoom = useCallback(() => {
        if (!roomId) return false

        if (!isSocketReady || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            shouldAutoJoinRef.current = true
            toast.message(joinPendingTitle, {
                description: joinPendingDescription,
            })
            return false
        }

        if (hasJoinedRef.current) return true
        return sendJoinNow()
    }, [isSocketReady, joinPendingDescription, joinPendingTitle, roomId, sendJoinNow])

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
        if (!roomId || !token) return

        setIsSocketReady(false)
        didSetConnectionErrorRef.current = false
        hasJoinedRef.current = false

        const wsUrl = `${getWsBaseUrl()}/api/ws/game?room_id=${roomId}&token=${token}`

        try {
            wsRef.current = new WebSocket(wsUrl)
        } catch (error) {
            console.error('Failed to create game WebSocket:', error)
            didSetConnectionErrorRef.current = true
            return
        }

        wsRef.current.onopen = () => {
            setIsSocketReady(true)
            didSetConnectionErrorRef.current = false
            if (shouldAutoJoinRef.current && !hasJoinedRef.current) {
                sendJoinNow()
            }
        }

        wsRef.current.onmessage = (event) => {
            try {
                const action = JSON.parse(event.data) as Record<string, unknown>
                onActionRef.current?.(action)
            } catch (error) {
                console.error('Failed to parse game socket message:', error)
            }
        }

        wsRef.current.onerror = () => {
            if (!didSetConnectionErrorRef.current) {
                setIsSocketReady(false)
                didSetConnectionErrorRef.current = true
            }
        }

        wsRef.current.onclose = () => {
            setIsSocketReady(false)
        }

        return () => {
            setIsSocketReady(false)
            wsRef.current?.close()
            wsRef.current = null
        }
    }, [roomId, token, sendJoinNow])

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
