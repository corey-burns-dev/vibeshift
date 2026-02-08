// usePresence - Real-time online status tracking using zustand

import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { getWsBaseUrl } from '@/lib/chat-utils'

// Zustand store for global presence state
interface PresenceState {
    onlineUserIds: Set<number>
    setOnline: (userId: number) => void
    setOffline: (userId: number) => void
    setInitialOnlineUsers: (userIds: number[]) => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
    onlineUserIds: new Set<number>(),
    setOnline: (userId: number) =>
        set((state) => {
            const newSet = new Set(state.onlineUserIds)
            newSet.add(userId)
            return { onlineUserIds: newSet }
        }),
    setOffline: (userId: number) =>
        set((state) => {
            const newSet = new Set(state.onlineUserIds)
            newSet.delete(userId)
            return { onlineUserIds: newSet }
        }),
    setInitialOnlineUsers: (userIds: number[]) =>
        set(() => ({ onlineUserIds: new Set<number>(userIds) })),
}))

// Types for presence events
interface UserStatusPayload {
    status: 'online' | 'offline'
    user_id: number
}

interface ConnectedUsersPayload {
    user_ids: number[]
}

interface PresenceEvent {
    type: string
    user_id?: number
    payload?: UserStatusPayload | ConnectedUsersPayload | Record<string, unknown>
}

// Hook to listen for presence events via dedicated WebSocket
export function usePresenceListener() {
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimeoutRef = useRef<number | undefined>(undefined)

    useEffect(() => {
        const connect = () => {
            const token = localStorage.getItem('token')
            if (!token) return

            // Close existing connection
            if (wsRef.current) {
                wsRef.current.close()
            }

            const wsUrl = `${getWsBaseUrl()}/api/ws/chat?token=${token}`

            const ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onmessage = (event) => {
                try {
                    const data: PresenceEvent = JSON.parse(event.data)

                    if (data.type === 'connected_users') {
                        const payload = data.payload as ConnectedUsersPayload
                        if (payload && Array.isArray(payload.user_ids)) {
                            setInitialOnlineUsers(payload.user_ids)
                        }
                    } else if (data.type === 'user_status') {
                        const payload = data.payload as UserStatusPayload
                        if (payload) {
                            if (payload.status === 'online') {
                                setOnline(payload.user_id)
                            } else if (payload.status === 'offline') {
                                setOffline(payload.user_id)
                            }
                        }
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            ws.onclose = () => {
                // Attempt to reconnect after 5 seconds
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    connect()
                }, 5000)
            }

            ws.onerror = () => {
                // Error handling - connection will close and trigger reconnect
            }
        }

        connect()

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }
        }
    }, [setOnline, setOffline, setInitialOnlineUsers])
}
