import { apiClient } from '@/api/client'
import type { Message, User } from '@/api/types'
import { useMyBlocks } from '@/hooks/useModeration'
import { useIsAuthenticated } from '@/hooks/useUsers'
import { logger } from '@/lib/logger'
import { createTicketedWS, getNextBackoff } from '@/lib/ws-utils'
import { useQueryClient } from '@tanstack/react-query'
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

interface ChatWebSocketMessage {
  type:
    | 'message'
    | 'room_message'
    | 'typing'
    | 'presence'
    | 'connected'
    | 'joined'
    | 'read'
    | 'user_status'
    | 'connected_users'
    | 'participant_joined'
    | 'participant_left'
    | 'chatroom_presence'
    | 'message_read'
    | 'message_reaction_updated'
    | 'chat_mention'
  conversation_id?: number
  user_id?: number
  username?: string
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  payload?: any
  error?: string
}

interface ChatContextValue {
  isConnected: boolean
  joinedRooms: Set<number>
  joinRoom: (conversationId: number) => void
  leaveRoom: (conversationId: number) => void
  sendTyping: (conversationId: number, isTyping: boolean) => void
  sendMessage: (conversationId: number, content: string) => void
  markAsRead: (conversationId: number) => void
  // Callbacks that components can register
  onMessage?: (message: Message, conversationId: number) => void
  onTyping?: (
    conversationId: number,
    userId: number,
    username: string,
    isTyping: boolean,
    expiresInMs?: number
  ) => void
  onPresence?: (userId: number, username: string, status: string) => void
  onConnectedUsers?: (userIds: number[]) => void
  onParticipantsUpdate?: (conversationId: number, participants: User[]) => void
  onChatroomPresence?: (payload: {
    conversation_id: number
    participants: User[]
    member_count?: number
    user_id?: number
    username?: string
    action?: string
    online_user_ids?: number[]
  }) => void
  setOnMessage: (
    callback?: (message: Message, conversationId: number) => void
  ) => void
  setOnTyping: (
    callback?: (
      conversationId: number,
      userId: number,
      username: string,
      isTyping: boolean,
      expiresInMs?: number
    ) => void
  ) => void
  setOnPresence: (
    callback?: (userId: number, username: string, status: string) => void
  ) => void
  setOnConnectedUsers: (callback?: (userIds: number[]) => void) => void
  setOnParticipantsUpdate: (
    callback?: (conversationId: number, participants: User[]) => void
  ) => void
  setOnChatroomPresence: (
    callback?: (payload: {
      conversation_id: number
      participants: User[]
      member_count?: number
      user_id?: number
      username?: string
      action?: string
      online_user_ids?: number[]
    }) => void
  ) => void
  // Preferred: subscription API that returns an unsubscribe function
  subscribeOnMessage: (
    callback: (message: Message, conversationId: number) => void
  ) => () => void
  subscribeOnTyping: (
    callback: (
      conversationId: number,
      userId: number,
      username: string,
      isTyping: boolean,
      expiresInMs?: number
    ) => void
  ) => () => void
  subscribeOnPresence: (
    callback: (userId: number, username: string, status: string) => void
  ) => () => void
  subscribeOnConnectedUsers: (
    callback: (userIds: number[]) => void
  ) => () => void
  subscribeOnParticipantsUpdate: (
    callback: (conversationId: number, participants: User[]) => void
  ) => () => void
  subscribeOnChatroomPresence: (
    callback: (payload: {
      conversation_id: number
      participants: User[]
      member_count?: number
      user_id?: number
      username?: string
      action?: string
      online_user_ids?: number[]
    }) => void
  ) => () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider')
  }
  return context
}

interface ChatProviderProps {
  children: ReactNode
}

export function ChatProvider({ children }: ChatProviderProps) {
  const isAuthenticated = useIsAuthenticated()
  const { data: myBlocks = [] } = useMyBlocks({ enabled: isAuthenticated })
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [joinedRooms, setJoinedRooms] = useState<Set<number>>(new Set())

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | undefined>(undefined)
  const reconnectAttemptsRef = useRef(0)
  const currentUserRef = useRef<{ id: number; username: string } | null>(null)
  const joinedRoomsRef = useRef<Set<number>>(new Set())
  const conversationsInvalidateTimerRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(true)

  // Load joined rooms from localStorage on mount
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        const storageKey = `joined_rooms:${user.id}`
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          const ids = JSON.parse(saved) as number[]
          for (const id of ids) {
            joinedRoomsRef.current.add(id)
          }
          setJoinedRooms(new Set(joinedRoomsRef.current))
        }
      } catch (e) {
        logger.error('Failed to load joined rooms', e)
      }
    }
  }, [])

  // Save joined rooms to localStorage when they change
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        const storageKey = `joined_rooms:${user.id}`
        localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(joinedRooms))
        )
      } catch {}
    }
  }, [joinedRooms])

  // Subscription-based handlers (support multiple subscribers)
  const messageHandlersRef = useRef<
    Set<(message: Message, conversationId: number) => void>
  >(new Set())
  const typingHandlersRef = useRef<
    Set<
      (
        conversationId: number,
        userId: number,
        username: string,
        isTyping: boolean,
        expiresInMs?: number
      ) => void
    >
  >(new Set())
  const presenceHandlersRef = useRef<
    Set<(userId: number, username: string, status: string) => void>
  >(new Set())
  const connectedUsersHandlersRef = useRef<Set<(userIds: number[]) => void>>(
    new Set()
  )
  const participantsUpdateHandlersRef = useRef<
    Set<(conversationId: number, participants: User[]) => void>
  >(new Set())
  const chatroomPresenceHandlersRef = useRef<
    Set<
      (payload: {
        conversation_id: number
        participants: User[]
        member_count?: number
        user_id?: number
        username?: string
        action?: string
        online_user_ids?: number[]
      }) => void
    >
  >(new Set())

  // Recent-message dedupe cache: key = `${convId}:${messageId}` -> timestamp
  const recentMessageMapRef = useRef<Map<string, number>>(new Map())
  const blockedUserIDsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    blockedUserIDsRef.current = new Set(
      myBlocks.map(block => block.blocked_id).filter(Boolean)
    )
  }, [myBlocks])

  const setOnMessage = useCallback(
    // Deprecated compatibility helper — prefer subscribeOnMessage
    (callback?: (message: Message, conversationId: number) => void) => {
      if (!callback) return () => {}
      messageHandlersRef.current.add(callback)
      return () => messageHandlersRef.current.delete(callback)
    },
    []
  )

  const setOnTyping = useCallback(
    (
      callback?: (
        conversationId: number,
        userId: number,
        username: string,
        isTyping: boolean,
        expiresInMs?: number
      ) => void
    ) => {
      if (!callback) return () => {}
      typingHandlersRef.current.add(callback)
      return () => typingHandlersRef.current.delete(callback)
    },
    []
  )

  const setOnPresence = useCallback(
    (callback?: (userId: number, username: string, status: string) => void) => {
      if (!callback) return () => {}
      presenceHandlersRef.current.add(callback)
      return () => presenceHandlersRef.current.delete(callback)
    },
    []
  )

  const setOnConnectedUsers = useCallback(
    (callback?: (userIds: number[]) => void) => {
      if (!callback) return () => {}
      connectedUsersHandlersRef.current.add(callback)
      return () => connectedUsersHandlersRef.current.delete(callback)
    },
    []
  )

  const setOnParticipantsUpdate = useCallback(
    (callback?: (conversationId: number, participants: User[]) => void) => {
      if (!callback) return () => {}
      participantsUpdateHandlersRef.current.add(callback)
      return () => participantsUpdateHandlersRef.current.delete(callback)
    },
    []
  )

  const setOnChatroomPresence = useCallback(
    (
      callback?: (payload: {
        conversation_id: number
        participants: User[]
        member_count?: number
        user_id?: number
        username?: string
        action?: string
        online_user_ids?: number[]
      }) => void
    ) => {
      if (!callback) return () => {}
      chatroomPresenceHandlersRef.current.add(callback)
      return () => chatroomPresenceHandlersRef.current.delete(callback)
    },
    []
  )

  // New explicit subscribe API (preferred): returns unsubscribe fn
  const subscribeOnMessage = useCallback(
    (cb: (message: Message, conversationId: number) => void) => {
      messageHandlersRef.current.add(cb)
      return () => messageHandlersRef.current.delete(cb)
    },
    []
  )

  const subscribeOnTyping = useCallback(
    (
      cb: (
        conversationId: number,
        userId: number,
        username: string,
        isTyping: boolean,
        expiresInMs?: number
      ) => void
    ) => {
      typingHandlersRef.current.add(cb)
      return () => typingHandlersRef.current.delete(cb)
    },
    []
  )

  const subscribeOnPresence = useCallback(
    (cb: (userId: number, username: string, status: string) => void) => {
      presenceHandlersRef.current.add(cb)
      return () => presenceHandlersRef.current.delete(cb)
    },
    []
  )

  const subscribeOnConnectedUsers = useCallback(
    (cb: (userIds: number[]) => void) => {
      connectedUsersHandlersRef.current.add(cb)
      return () => connectedUsersHandlersRef.current.delete(cb)
    },
    []
  )

  const subscribeOnParticipantsUpdate = useCallback(
    (cb: (conversationId: number, participants: User[]) => void) => {
      participantsUpdateHandlersRef.current.add(cb)
      return () => participantsUpdateHandlersRef.current.delete(cb)
    },
    []
  )

  const subscribeOnChatroomPresence = useCallback(
    (
      cb: (payload: {
        conversation_id: number
        participants: User[]
        member_count?: number
        user_id?: number
        username?: string
        action?: string
        online_user_ids?: number[]
      }) => void
    ) => {
      chatroomPresenceHandlersRef.current.add(cb)
      return () => chatroomPresenceHandlersRef.current.delete(cb)
    },
    []
  )

  const refreshBlockedUsers = useCallback(async () => {
    try {
      const blocks = await apiClient.getMyBlocks()
      blockedUserIDsRef.current = new Set(
        blocks.map(block => block.blocked_id).filter(Boolean)
      )
    } catch {
      blockedUserIDsRef.current = new Set()
    }
  }, [])

  const connect = useCallback(async () => {
    if (!isAuthenticated) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    // Get current user info from localStorage
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        currentUserRef.current = { id: user.id, username: user.username }
      } catch {}
    }
    await refreshBlockedUsers()

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
          reconnectAttemptsRef.current = 0
          // allow reconnects; mark that reconnection should be attempted
          shouldReconnectRef.current = true

          // Re-join all rooms that were previously joined
          const roomsToJoin = new Set(joinedRoomsRef.current)
          for (const roomId of roomsToJoin) {
            ws.send(JSON.stringify({ type: 'join', conversation_id: roomId }))
          }
        },
        onMessage: event => {
          if (ws !== wsRef.current) return

          try {
            const data: ChatWebSocketMessage = JSON.parse(event.data)

            if (data.error) {
              logger.error('WS Server Error:', data.error)
              if (
                data.error === 'invalid token' ||
                data.error === 'Invalid or expired WebSocket ticket'
              ) {
                // We might need to refresh token or re-login if ticket/token fails
                // But createTicketedWS handles ticket issuance.
                return
              }
            }

            const scheduleConversationsInvalidate = () => {
              if (conversationsInvalidateTimerRef.current !== null) return
              conversationsInvalidateTimerRef.current = window.setTimeout(
                () => {
                  conversationsInvalidateTimerRef.current = null
                  // Invalidate DMs list
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'conversations'],
                  })
                  // Invalidate Chatrooms lists
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'chatrooms'],
                  })
                },
                300
              )
            }

            const isKnownConversation = (conversationID: number) => {
              if (joinedRoomsRef.current.has(conversationID)) return true

              const conversations = queryClient.getQueryData<
                Array<{ id: number }>
              >(['chat', 'conversations'])
              return Array.isArray(conversations)
                ? conversations.some(
                    conversation => conversation.id === conversationID
                  )
                : false
            }

            switch (data.type) {
              case 'connected':
                break

              case 'joined': {
                const joinedId = data.conversation_id
                if (joinedId) {
                  joinedRoomsRef.current.add(joinedId)
                  setJoinedRooms(new Set(joinedRoomsRef.current))
                }
                break
              }

              case 'message': {
                // Support payload either under `payload` or flat top-level keys
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const message = payload as Message
                if (!convId || !message || !message.id) break
                if (
                  typeof message.sender_id === 'number' &&
                  blockedUserIDsRef.current.has(message.sender_id)
                ) {
                  break
                }

                // Dedupe by conversation + message.id using short TTL map
                const key = `${convId}:${message.id}`
                const now = Date.now()
                const recent = recentMessageMapRef.current
                // cleanup old entries when map grows
                if (recent.size > 2000) {
                  for (const [k, ts] of recent) {
                    if (now - ts > 1000 * 60 * 5) recent.delete(k)
                  }
                }
                if (recent.has(key)) break
                recent.set(key, now)

                // Update TanStack Query cache (avoid duplicates)
                queryClient.setQueryData<Message[]>(
                  ['chat', 'messages', convId],
                  old => {
                    if (!old) return [message]
                    if (old.some(m => m.id === message.id)) return old

                    // If this is our own message coming back via WebSocket, replace the optimistic one
                    const tempId = (message.metadata as Record<string, unknown>)
                      ?.tempId
                    if (tempId) {
                      const hasOptimistic = old.some(
                        m =>
                          (m.metadata as Record<string, unknown>)?.tempId ===
                          tempId
                      )
                      if (hasOptimistic) {
                        return old.map(m =>
                          (m.metadata as Record<string, unknown>)?.tempId ===
                          tempId
                            ? message
                            : m
                        )
                      }
                    }

                    return [...old, message]
                  }
                )

                // Ensure conversation list reflects new last_message / ordering
                scheduleConversationsInvalidate()

                // Notify all subscribers
                for (const cb of messageHandlersRef.current) {
                  try {
                    cb(message, convId)
                  } catch (e) {
                    logger.error('message handler failed', e)
                  }
                }
                break
              }
              case 'room_message': {
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const message = payload as Message
                if (!convId || !message || !message.id) break
                if (!isKnownConversation(convId)) break
                if (
                  typeof message.sender_id === 'number' &&
                  blockedUserIDsRef.current.has(message.sender_id)
                ) {
                  break
                }

                const key = `${convId}:${message.id}`
                const now = Date.now()
                const recent = recentMessageMapRef.current
                if (recent.size > 2000) {
                  for (const [k, ts] of recent) {
                    if (now - ts > 1000 * 60 * 5) recent.delete(k)
                  }
                }
                if (recent.has(key)) break
                recent.set(key, now)

                queryClient.setQueryData<Message[]>(
                  ['chat', 'messages', convId],
                  old => {
                    if (!old) return [message]
                    if (old.some(m => m.id === message.id)) return old

                    // If this is our own message coming back via WebSocket, replace the optimistic one
                    const tempId = (message.metadata as Record<string, unknown>)
                      ?.tempId
                    if (tempId) {
                      const hasOptimistic = old.some(
                        m =>
                          (m.metadata as Record<string, unknown>)?.tempId ===
                          tempId
                      )
                      if (hasOptimistic) {
                        return old.map(m =>
                          (m.metadata as Record<string, unknown>)?.tempId ===
                          tempId
                            ? message
                            : m
                        )
                      }
                    }

                    return [...old, message]
                  }
                )

                scheduleConversationsInvalidate()

                for (const cb of messageHandlersRef.current) {
                  try {
                    cb(message, convId)
                  } catch (e) {
                    logger.error('message handler failed', e)
                  }
                }
                break
              }

              case 'typing': {
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const userId = payload.user_id || payload.userId || data.user_id
                const username = payload.username || data.username
                const isTyping = payload.is_typing ?? payload.isTyping
                const expiresInMsRaw = payload.expires_in_ms
                const expiresInMs =
                  typeof expiresInMsRaw === 'number' ? expiresInMsRaw : 5000
                if (!convId) break
                for (const cb of typingHandlersRef.current) {
                  try {
                    cb(convId, userId, username, !!isTyping, expiresInMs)
                  } catch (e) {
                    logger.error('typing handler failed', e)
                  }
                }
                break
              }

              case 'presence':
              case 'user_status': {
                const payload = data.payload || data
                const userId = payload.user_id || payload.userId || data.user_id
                const username = payload.username || data.username
                const status = payload.status
                for (const cb of presenceHandlersRef.current) {
                  try {
                    cb(userId, username, status)
                  } catch (e) {
                    logger.error('presence handler failed', e)
                  }
                }
                break
              }

              case 'connected_users': {
                const payload = data.payload || data
                const ids = payload.user_ids || payload.userIds
                if (Array.isArray(ids)) {
                  for (const cb of connectedUsersHandlersRef.current) {
                    try {
                      cb(ids)
                    } catch (e) {
                      logger.error('connected_users handler failed', e)
                    }
                  }
                }
                break
              }

              case 'participant_joined':
              case 'participant_left': {
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const participants = payload.participants
                if (convId && Array.isArray(participants)) {
                  for (const cb of participantsUpdateHandlersRef.current) {
                    try {
                      cb(convId, participants)
                    } catch (e) {
                      logger.error('participantsUpdate handler failed', e)
                    }
                  }
                }
                break
              }

              case 'chatroom_presence': {
                const payload = data.payload || data
                for (const cb of chatroomPresenceHandlersRef.current) {
                  try {
                    cb(payload)
                  } catch (e) {
                    logger.error('chatroomPresence handler failed', e)
                  }
                }
                break
              }

              case 'message_reaction_updated': {
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const messageID = payload.message_id
                const reactions = payload.reactions
                if (!convId || typeof messageID !== 'number') break
                queryClient.setQueryData<Message[]>(
                  ['chat', 'messages', convId],
                  oldMessages =>
                    oldMessages?.map(message =>
                      message.id === messageID
                        ? {
                            ...message,
                            reaction_summary: Array.isArray(reactions)
                              ? reactions
                              : [],
                          }
                        : message
                    ) ?? oldMessages
                )
                break
              }

              case 'message_read':
              case 'read': {
                const payload = data.payload || data
                const convId = payload.conversation_id || data.conversation_id
                const readByUserID =
                  payload.user_id || payload.userId || data.user_id
                const readAt = payload.read_at
                if (!convId) break

                const currentUserID = currentUserRef.current?.id
                if (
                  typeof currentUserID === 'number' &&
                  typeof readByUserID === 'number' &&
                  readByUserID !== currentUserID
                ) {
                  queryClient.setQueryData<Message[]>(
                    ['chat', 'messages', convId],
                    oldMessages =>
                      oldMessages?.map(message =>
                        message.sender_id === currentUserID
                          ? {
                              ...message,
                              is_read: true,
                              read_at:
                                typeof readAt === 'string'
                                  ? readAt
                                  : message.read_at,
                            }
                          : message
                      ) ?? oldMessages
                  )
                } else {
                  queryClient.invalidateQueries({
                    queryKey: ['chat', 'messages', convId],
                  })
                }
                break
              }

              case 'chat_mention':
                queryClient.invalidateQueries({
                  queryKey: ['moderation', 'mentions'],
                })
                break
            }
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error)
          }
        },
        onError: error => {
          if (ws !== wsRef.current) return
          logger.error('WebSocket error:', error)
        },
        onClose: () => {
          if (ws !== wsRef.current) return

          wsRef.current = null
          setIsConnected(false)

          // Only reconnect if still authenticated and not explicitly disabled
          if (isAuthenticated && shouldReconnectRef.current) {
            const delay = getNextBackoff(reconnectAttemptsRef.current++)
            logger.debug(
              `WebSocket disconnected. Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`
            )
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect()
            }, delay)
          }
        },
      })

      wsRef.current = ws
    } catch (_err) {
      if (isAuthenticated && shouldReconnectRef.current) {
        const delay = getNextBackoff(reconnectAttemptsRef.current++)
        reconnectTimeoutRef.current = window.setTimeout(connect, delay)
      }
    }
  }, [isAuthenticated, queryClient, refreshBlockedUsers])

  // Connect on mount / auth change
  useEffect(() => {
    if (!isAuthenticated) {
      // Close connection on logout
      if (wsRef.current) {
        shouldReconnectRef.current = false
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      setIsConnected(false)
      joinedRoomsRef.current.clear()
      setJoinedRooms(new Set())
      blockedUserIDsRef.current.clear()
      return
    }

    // Deferred connect to avoid React 19 StrictMode double-connect
    const timer = window.setTimeout(connect, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isAuthenticated, connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (conversationsInvalidateTimerRef.current !== null) {
        clearTimeout(conversationsInvalidateTimerRef.current)
        conversationsInvalidateTimerRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const joinRoom = useCallback((conversationId: number) => {
    // Always record the intent to join this room so we can re-join when
    // the WebSocket connects. If the socket is open, send the join.
    if (!joinedRoomsRef.current.has(conversationId)) {
      joinedRoomsRef.current.add(conversationId)
      setJoinedRooms(new Set(joinedRoomsRef.current))
    }

    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', conversation_id: conversationId }))
    }
  }, [])

  const leaveRoom = useCallback((conversationId: number) => {
    // Always remove from requested joins immediately. If the socket is open,
    // also send the leave message to the server.
    if (joinedRoomsRef.current.has(conversationId)) {
      joinedRoomsRef.current.delete(conversationId)
      setJoinedRooms(new Set(joinedRoomsRef.current))
    }

    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave', conversation_id: conversationId }))
    }
  }, [])

  const sendTyping = useCallback(
    (conversationId: number, isTyping: boolean) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      ws.send(
        JSON.stringify({
          type: 'typing',
          conversation_id: conversationId,
          is_typing: isTyping,
        })
      )
    },
    []
  )

  const sendMessage = useCallback((conversationId: number, content: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(
      JSON.stringify({
        type: 'message',
        conversation_id: conversationId,
        content,
      })
    )
  }, [])

  const markAsRead = useCallback((conversationId: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(
      JSON.stringify({
        type: 'read',
        conversation_id: conversationId,
      })
    )
  }, [])

  const value = useMemo<ChatContextValue>(
    () => ({
      isConnected,
      joinedRooms,
      joinRoom,
      leaveRoom,
      sendTyping,
      sendMessage,
      markAsRead,
      onMessage: undefined,
      onTyping: undefined,
      onPresence: undefined,
      onConnectedUsers: undefined,
      onParticipantsUpdate: undefined,
      onChatroomPresence: undefined,
      setOnMessage,
      setOnTyping,
      setOnPresence,
      setOnConnectedUsers,
      setOnParticipantsUpdate,
      setOnChatroomPresence,
      subscribeOnMessage,
      subscribeOnTyping,
      subscribeOnPresence,
      subscribeOnConnectedUsers,
      subscribeOnParticipantsUpdate,
      subscribeOnChatroomPresence,
    }),
    [
      isConnected,
      joinedRooms,
      joinRoom,
      leaveRoom,
      sendTyping,
      sendMessage,
      markAsRead,
      setOnMessage,
      setOnTyping,
      setOnPresence,
      setOnConnectedUsers,
      setOnParticipantsUpdate,
      setOnChatroomPresence,
      subscribeOnMessage,
      subscribeOnTyping,
      subscribeOnPresence,
      subscribeOnConnectedUsers,
      subscribeOnParticipantsUpdate,
      subscribeOnChatroomPresence,
    ]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
