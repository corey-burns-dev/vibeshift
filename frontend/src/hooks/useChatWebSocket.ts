// WebSocket hook for real-time chat

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, User } from '@/api/types'

interface ChatWebSocketMessage {
    type:
        | 'message'
        | 'typing'
        | 'presence'
        | 'connected'
        | 'joined'
        | 'read'
        | 'user_status'
        | 'connected_users'
        | 'participant_joined'
        | 'participant_left'
    conversation_id?: number
    user_id?: number
    username?: string
    // biome-ignore lint/suspicious/noExplicitAny: generic payload
    payload?: any
}

interface UseChatWebSocketOptions {
    conversationId: number
    enabled?: boolean
    onMessage?: (message: Message) => void
    onTyping?: (userId: number, username: string, isTyping: boolean) => void
    onPresence?: (userId: number, username: string, status: string) => void
    onConnectedUsers?: (userIds: number[]) => void
    onParticipantsUpdate?: (participants: User[]) => void
}

export function useChatWebSocket({
    conversationId,
    enabled = true,
    onMessage,
    onTyping,
    onPresence,
    onConnectedUsers,
    onParticipantsUpdate,
}: UseChatWebSocketOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [isJoined, setIsJoined] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const queryClient = useQueryClient()
    const reconnectTimeoutRef = useRef<number | undefined>(undefined)
    const currentUserRef = useRef<{ id: number; username: string } | null>(null)

    // Keep latest callbacks in refs to avoid reconnection on render
    const onMessageRef = useRef(onMessage)
    const onTypingRef = useRef(onTyping)
    const onPresenceRef = useRef(onPresence)
    const onConnectedUsersRef = useRef(onConnectedUsers)
    const onParticipantsUpdateRef = useRef(onParticipantsUpdate)

    useEffect(() => {
        onMessageRef.current = onMessage
        onTypingRef.current = onTyping
        onPresenceRef.current = onPresence
        onConnectedUsersRef.current = onConnectedUsers
        onParticipantsUpdateRef.current = onParticipantsUpdate
    }, [onMessage, onTyping, onPresence, onConnectedUsers, onParticipantsUpdate])

    const connect = useCallback(() => {
        if (!enabled) return

        const token = localStorage.getItem('token')
        if (!token) {
            console.error('No auth token found')
            return
        }

        // Get current user info from localStorage
        const userStr = localStorage.getItem('user')
        if (userStr) {
            try {
                const user = JSON.parse(userStr)
                currentUserRef.current = { id: user.id, username: user.username }
            } catch {}
        }

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close()
        }

        // Create WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.hostname
        const port = import.meta.env.VITE_API_PORT || '8375'
        const wsUrl = `${protocol}//${host}:${port}/api/ws/chat?token=${token}`
        const ws = new WebSocket(wsUrl)

        wsRef.current = ws

        ws.onopen = () => {
            if (ws !== wsRef.current) return

            setIsConnected(true)

            // Add current user to online presence immediately
            if (currentUserRef.current && onPresenceRef.current) {
                onPresenceRef.current(
                    currentUserRef.current.id,
                    currentUserRef.current.username,
                    'online'
                )
            }

            // Join the conversation
            ws.send(
                JSON.stringify({
                    type: 'join',
                    conversation_id: conversationId,
                })
            )
        }

        ws.onmessage = (event) => {
            if (ws !== wsRef.current) return

            try {
                const data: ChatWebSocketMessage = JSON.parse(event.data)

                switch (data.type) {
                    case 'connected':
                        break

                    case 'joined':
                        setIsJoined(true)
                        // Refetch messages to get initial state
                        queryClient.refetchQueries({
                            queryKey: ['chat', 'messages', conversationId],
                        })
                        break

                    case 'message':
                        // Add message to cache
                        if (data.payload && data.conversation_id === conversationId) {
                            const message = data.payload as Message
                            let msgMetadata: Record<string, unknown> | undefined = message.metadata
                            if (typeof msgMetadata === 'string') {
                                try {
                                    msgMetadata = JSON.parse(msgMetadata)
                                } catch {}
                            }

                            // Update messages cache
                            queryClient.setQueryData<Message[]>(
                                ['chat', 'messages', conversationId],
                                (old) => {
                                    if (!old) return [message]

                                    // Check for tempId match (optimistic update)
                                    const tempId = msgMetadata?.tempId
                                    if (tempId) {
                                        const optimisticIndex = old.findIndex((m) => {
                                            const mMeta = m.metadata as
                                                | Record<string, unknown>
                                                | undefined
                                            return (mMeta?.tempId as string) === tempId
                                        })
                                        if (optimisticIndex !== -1) {
                                            const newMessages = [...old]
                                            newMessages[optimisticIndex] = message
                                            return newMessages
                                        }
                                    }

                                    // Fallback: Check for content match on optimistic messages
                                    // (useful if metadata/tempId was lost)
                                    const contentMatchIndex = old.findIndex(
                                        (m) =>
                                            (m as Message & { isOptimistic?: boolean })
                                                .isOptimistic && m.content === message.content
                                    )
                                    if (contentMatchIndex !== -1) {
                                        const newMessages = [...old]
                                        newMessages[contentMatchIndex] = message
                                        return newMessages
                                    }

                                    // Avoid duplicates by ID
                                    if (old.some((m) => m.id === message.id)) return old
                                    return [...old, message]
                                }
                            )

                            // Call callback
                            if (onMessageRef.current) {
                                onMessageRef.current(message)
                            }
                        }
                        break

                    case 'typing':
                        if (data.payload && onTypingRef.current) {
                            const { user_id, username, is_typing } = data.payload
                            onTypingRef.current(user_id, username, is_typing)
                        }
                        break

                    case 'presence':
                    case 'user_status':
                        if (data.payload && onPresenceRef.current) {
                            const { user_id, username, status } = data.payload
                            onPresenceRef.current(user_id, username, status)
                        }
                        break

                    case 'connected_users':
                        if (data.payload && onConnectedUsersRef.current) {
                            const { user_ids } = data.payload
                            if (Array.isArray(user_ids)) {
                                onConnectedUsersRef.current(user_ids)
                            }
                        }
                        break

                    case 'participant_joined':
                    case 'participant_left':
                        if (data.payload && onParticipantsUpdateRef.current) {
                            const { participants } = data.payload
                            if (Array.isArray(participants)) {
                                onParticipantsUpdateRef.current(participants)
                            }
                        }
                        break

                    case 'read':
                        // Invalidate messages to refresh read status
                        queryClient.invalidateQueries({
                            queryKey: ['chat', 'messages', conversationId],
                        })
                        break
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error)
            }
        }

        ws.onerror = (error) => {
            if (ws !== wsRef.current) return
            console.error('WebSocket error:', error)
        }

        ws.onclose = () => {
            // Only reconnect if this is the ACTIVE socket
            if (ws !== wsRef.current) return

            console.log('WebSocket disconnected')
            setIsConnected(false)
            setIsJoined(false)

            // Attempt to reconnect after 3 seconds if still enabled
            if (enabled) {
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    console.log('Attempting to reconnect...')
                    connect()
                }, 3000)
            }
        }
    }, [conversationId, enabled, queryClient])

    // Connect on mount and when conversation changes
    useEffect(() => {
        connect()

        return () => {
            // Leave conversation before disconnecting
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: 'leave',
                        conversation_id: conversationId,
                    })
                )
            }

            // Close connection
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }

            // Clear reconnect timeout
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }

            setIsJoined(false)
            setIsConnected(false)
        }
    }, [conversationId, connect])

    // Send typing indicator
    const sendTyping = useCallback(
        (isTyping: boolean) => {
            if (wsRef.current && isConnected && isJoined) {
                wsRef.current.send(
                    JSON.stringify({
                        type: 'typing',
                        conversation_id: conversationId,
                        is_typing: isTyping,
                    })
                )
            }
        },
        [conversationId, isConnected, isJoined]
    )

    // Send message via WebSocket (alternative to HTTP)
    const sendMessage = useCallback(
        (content: string) => {
            if (wsRef.current && isConnected && isJoined) {
                wsRef.current.send(
                    JSON.stringify({
                        type: 'message',
                        conversation_id: conversationId,
                        content,
                    })
                )
            }
        },
        [conversationId, isConnected, isJoined]
    )

    // Mark as read
    const markAsRead = useCallback(() => {
        if (wsRef.current && isConnected && isJoined) {
            wsRef.current.send(
                JSON.stringify({
                    type: 'read',
                    conversation_id: conversationId,
                })
            )
        }
    }, [conversationId, isConnected, isJoined])

    return {
        isConnected,
        isJoined,
        sendTyping,
        sendMessage,
        markAsRead,
    }
}
