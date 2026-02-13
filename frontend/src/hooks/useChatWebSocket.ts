/**
 * WebSocket hook for real-time chat.
 *
 * @deprecated Prefer `useChatContext()` from `@/providers/ChatProvider` so the app
 * uses a single persistent WebSocket. This hook creates its own connection and is
 * only kept for backward compatibility or non-Provider usage.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, User } from '@/api/types'
import { logger } from '@/lib/logger'
import { createTicketedWS, getNextBackoff } from '@/lib/ws-utils'

interface ChatWebSocketMessage {
  // ...
  type:
    | 'message'
    | 'room_message'
    | 'typing'
    | 'presence'
    | 'connected'
    | 'joined'
    | 'read'
    | 'message_read'
    | 'message_reaction_updated'
    | 'chat_mention'
    | 'user_status'
    | 'connected_users'
    | 'participant_joined'
    | 'participant_left'
    | 'chatroom_presence'
  conversation_id?: number
  user_id?: number
  username?: string
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  payload?: any
  error?: string
}

interface UseChatWebSocketOptions {
  conversationId: number
  enabled?: boolean
  autoJoinConversation?: boolean
  /** All room IDs the user has open as tabs — the hook stays joined to all of them */
  joinedRoomIds?: number[]
  onMessage?: (message: Message) => void
  onRoomMessage?: (message: Message, conversationId: number) => void
  onTyping?: (userId: number, username: string, isTyping: boolean) => void
  onPresence?: (userId: number, username: string, status: string) => void
  onConnectedUsers?: (userIds: number[]) => void
  onParticipantsUpdate?: (participants: User[]) => void
  onChatroomPresence?: (payload: {
    conversation_id: number
    participants: User[]
    member_count?: number
    user_id?: number
    username?: string
    action?: string
    online_user_ids?: number[]
  }) => void
}

const EMPTY_ROOM_IDS: number[] = []

export function useChatWebSocket({
  conversationId,
  enabled = true,
  autoJoinConversation = true,
  joinedRoomIds = EMPTY_ROOM_IDS,
  onMessage,
  onRoomMessage,
  onTyping,
  onPresence,
  onConnectedUsers,
  onParticipantsUpdate,
  onChatroomPresence,
}: UseChatWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [joinedSet, setJoinedSet] = useState<Set<number>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<number | undefined>(undefined)
  const currentUserRef = useRef<{ id: number; username: string } | null>(null)
  const autoJoinConversationRef = useRef(autoJoinConversation)
  const conversationIdRef = useRef(conversationId)
  const joinedRoomsRef = useRef<Set<number>>(new Set())

  const isJoined = joinedSet.has(conversationId)

  // Keep latest callbacks in refs to avoid reconnection on render
  const onMessageRef = useRef(onMessage)
  const onTypingRef = useRef(onTyping)
  const onPresenceRef = useRef(onPresence)
  const onConnectedUsersRef = useRef(onConnectedUsers)
  const onParticipantsUpdateRef = useRef(onParticipantsUpdate)
  const onRoomMessageRef = useRef(onRoomMessage)
  const onChatroomPresenceRef = useRef(onChatroomPresence)

  useEffect(() => {
    onMessageRef.current = onMessage
    onTypingRef.current = onTyping
    onPresenceRef.current = onPresence
    onConnectedUsersRef.current = onConnectedUsers
    onParticipantsUpdateRef.current = onParticipantsUpdate
    onRoomMessageRef.current = onRoomMessage
    onChatroomPresenceRef.current = onChatroomPresence
  }, [
    onMessage,
    onTyping,
    onPresence,
    onConnectedUsers,
    onParticipantsUpdate,
    onRoomMessage,
    onChatroomPresence,
  ])

  useEffect(() => {
    autoJoinConversationRef.current = autoJoinConversation
  }, [autoJoinConversation])

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  const connect = useCallback(async () => {
    if (!enabled) return

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
    try {
      const ws = await createTicketedWS({
        path: '/api/ws/chat',
        onOpen: () => {
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

          // Re-join all rooms that were open as tabs (+ active conversation)
          const roomsToJoin = new Set(joinedRoomsRef.current)
          const convId = conversationIdRef.current
          if (autoJoinConversationRef.current && convId > 0) {
            roomsToJoin.add(convId)
          }
          for (const roomId of roomsToJoin) {
            ws.send(JSON.stringify({ type: 'join', conversation_id: roomId }))
          }
        },
        onMessage: event => {
          if (ws !== wsRef.current) return

          try {
            // Raw message received
            const data: ChatWebSocketMessage = JSON.parse(event.data)

            if (data.error) {
              logger.error('WS Server Error:', data.error)
              // If invalid token/ticket, we don't force redirect here since it's deprecated
            }

            const activeConvId = conversationIdRef.current

            switch (data.type) {
              case 'connected':
                break

              case 'joined': {
                const joinedId = data.conversation_id || activeConvId
                if (joinedId) {
                  joinedRoomsRef.current.add(joinedId)
                  setJoinedSet(new Set(joinedRoomsRef.current))
                }
                queryClient.refetchQueries({
                  queryKey: ['chat', 'messages', joinedId],
                })
                break
              }

              case 'message':
                // Add message to cache
                if (data.payload && data.conversation_id === activeConvId) {
                  const message = data.payload as Message
                  let msgMetadata: Record<string, unknown> | undefined =
                    message.metadata
                  if (typeof msgMetadata === 'string') {
                    try {
                      msgMetadata = JSON.parse(msgMetadata)
                    } catch {}
                  }

                  // Update messages cache
                  queryClient.setQueryData<Message[]>(
                    ['chat', 'messages', activeConvId],
                    old => {
                      if (!old) return [message]

                      // Check for tempId match (optimistic update)
                      const tempId = msgMetadata?.tempId
                      if (tempId) {
                        const optimisticIndex = old.findIndex(m => {
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
                        m =>
                          (m as Message & { isOptimistic?: boolean })
                            .isOptimistic && m.content === message.content
                      )
                      if (contentMatchIndex !== -1) {
                        const newMessages = [...old]
                        newMessages[contentMatchIndex] = message
                        return newMessages
                      }

                      // Avoid duplicates by ID
                      if (old.some(m => m.id === message.id)) return old
                      return [...old, message]
                    }
                  )

                  // Call callback
                  if (onMessageRef.current) {
                    onMessageRef.current(message)
                  }
                }
                break

              case 'room_message':
                if (data.payload && typeof data.conversation_id === 'number') {
                  const roomMessage = data.payload as Message
                  if (onRoomMessageRef.current) {
                    onRoomMessageRef.current(roomMessage, data.conversation_id)
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

              case 'chatroom_presence':
                if (data.payload && onChatroomPresenceRef.current) {
                  const payload = data.payload as {
                    conversation_id: number
                    participants?: User[]
                    member_count?: number
                    user_id?: number
                    username?: string
                    action?: string
                    online_user_ids?: number[]
                  }
                  onChatroomPresenceRef.current({
                    conversation_id: payload.conversation_id,
                    participants: Array.isArray(payload.participants)
                      ? payload.participants
                      : [],
                    member_count: payload.member_count,
                    user_id: payload.user_id,
                    username: payload.username,
                    action: payload.action,
                    online_user_ids: Array.isArray(payload.online_user_ids)
                      ? payload.online_user_ids
                      : [],
                  })
                }
                break

              case 'message_read':
              case 'read':
                // Invalidate messages to refresh read status
                queryClient.invalidateQueries({
                  queryKey: ['chat', 'messages', activeConvId],
                })
                break
            }
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error)
          }
        },
        onClose: event => {
          // Only reconnect if this is the ACTIVE socket
          if (ws !== wsRef.current) return

          logger.debug('WebSocket disconnected:', event.code, event.reason)
          wsRef.current = null
          setIsConnected(false)
          joinedRoomsRef.current.clear()
          setJoinedSet(new Set())

          // Attempt to reconnect after backoff if still enabled
          if (enabled) {
            const delay = getNextBackoff(0) // use fixed or low attempt for this deprecated one
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect()
            }, delay)
          }
        },
        onError: error => {
          if (ws !== wsRef.current) return
          logger.error('WebSocket error:', error)
        },
      })
      wsRef.current = ws
    } catch (_err) {
      if (enabled) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000)
      }
    }
  }, [enabled, queryClient]) // NOTE: no conversationId — connection is persistent

  // Sync joined rooms with open tabs — join new ones, leave closed ones
  useEffect(() => {
    if (!isConnected) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const desired = new Set(joinedRoomIds)
    // Also include the active conversation if auto-join is on
    if (autoJoinConversation && conversationId > 0) {
      desired.add(conversationId)
    }

    const current = joinedRoomsRef.current

    // Join rooms that are desired but not yet joined
    for (const roomId of desired) {
      if (!current.has(roomId)) {
        ws.send(JSON.stringify({ type: 'join', conversation_id: roomId }))
      }
    }

    // Leave rooms that are joined but no longer desired
    for (const roomId of current) {
      if (!desired.has(roomId)) {
        ws.send(JSON.stringify({ type: 'leave', conversation_id: roomId }))
        current.delete(roomId)
      }
    }

    // Update ref to match desired (joined confirmations come via 'joined' messages)
    let changed = false
    for (const roomId of desired) {
      if (!current.has(roomId)) changed = true
      current.add(roomId)
    }
    if (changed) {
      setJoinedSet(new Set(current))
    }
  }, [joinedRoomIds, conversationId, isConnected, autoJoinConversation])

  // Connect on mount (persistent — does not depend on conversationId)
  // Deferred via setTimeout to avoid "closed before established" in React 19 StrictMode dev.
  useEffect(() => {
    const timer = window.setTimeout(connect, 0)

    return () => {
      window.clearTimeout(timer)

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      joinedRoomsRef.current.clear()
      setJoinedSet(new Set())
      setIsConnected(false)
    }
  }, [connect])

  // Send typing indicator
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (wsRef.current && isConnected && isJoined) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing',
            conversation_id: conversationIdRef.current,
            is_typing: isTyping,
          })
        )
      }
    },
    [isConnected, isJoined]
  )

  // Send message via WebSocket (alternative to HTTP)
  const sendMessage = useCallback(
    (content: string) => {
      if (wsRef.current && isConnected && isJoined) {
        wsRef.current.send(
          JSON.stringify({
            type: 'message',
            conversation_id: conversationIdRef.current,
            content,
          })
        )
      }
    },
    [isConnected, isJoined]
  )

  // Mark as read
  const markAsRead = useCallback(() => {
    if (wsRef.current && isConnected && isJoined) {
      wsRef.current.send(
        JSON.stringify({
          type: 'read',
          conversation_id: conversationIdRef.current,
        })
      )
    }
  }, [isConnected, isJoined])

  return {
    isConnected,
    isJoined,
    sendTyping,
    sendMessage,
    markAsRead,
  }
}
