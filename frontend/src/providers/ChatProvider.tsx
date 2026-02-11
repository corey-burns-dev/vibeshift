import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Message, User } from '@/api/types'
import { useIsAuthenticated } from '@/hooks/useUsers'
import { getWsBaseUrl } from '@/lib/chat-utils'

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
    isTyping: boolean
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
      isTyping: boolean
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
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [joinedRooms, setJoinedRooms] = useState<Set<number>>(new Set())

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | undefined>(undefined)
  const reconnectAttemptsRef = useRef(0)
  const currentUserRef = useRef<{ id: number; username: string } | null>(null)
  const joinedRoomsRef = useRef<Set<number>>(new Set())
  const hasConnectedRef = useRef(false)

  // Callback refs
  const onMessageRef = useRef<
    ((message: Message, conversationId: number) => void) | undefined
  >()
  const onTypingRef = useRef<
    | ((
        conversationId: number,
        userId: number,
        username: string,
        isTyping: boolean
      ) => void)
    | undefined
  >()
  const onPresenceRef = useRef<
    ((userId: number, username: string, status: string) => void) | undefined
  >()
  const onConnectedUsersRef = useRef<
    ((userIds: number[]) => void) | undefined
  >()
  const onParticipantsUpdateRef = useRef<
    ((conversationId: number, participants: User[]) => void) | undefined
  >()
  const onChatroomPresenceRef = useRef<
    | ((payload: {
        conversation_id: number
        participants: User[]
        member_count?: number
        user_id?: number
        username?: string
        action?: string
        online_user_ids?: number[]
      }) => void)
    | undefined
  >()

  const setOnMessage = useCallback(
    (callback?: (message: Message, conversationId: number) => void) => {
      onMessageRef.current = callback
    },
    []
  )

  const setOnTyping = useCallback(
    (
      callback?: (
        conversationId: number,
        userId: number,
        username: string,
        isTyping: boolean
      ) => void
    ) => {
      onTypingRef.current = callback
    },
    []
  )

  const setOnPresence = useCallback(
    (callback?: (userId: number, username: string, status: string) => void) => {
      onPresenceRef.current = callback
    },
    []
  )

  const setOnConnectedUsers = useCallback(
    (callback?: (userIds: number[]) => void) => {
      onConnectedUsersRef.current = callback
    },
    []
  )

  const setOnParticipantsUpdate = useCallback(
    (callback?: (conversationId: number, participants: User[]) => void) => {
      onParticipantsUpdateRef.current = callback
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
      onChatroomPresenceRef.current = callback
    },
    []
  )

  const connect = useCallback(() => {
    if (!isAuthenticated) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

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
    const wsUrl = `${getWsBaseUrl()}/api/ws/chat?token=${token}`
    const ws = new WebSocket(wsUrl)

    wsRef.current = ws

    ws.onopen = () => {
      if (ws !== wsRef.current) return

      setIsConnected(true)
      reconnectAttemptsRef.current = 0
      hasConnectedRef.current = true

      // Re-join all rooms that were previously joined
      const roomsToJoin = new Set(joinedRoomsRef.current)
      for (const roomId of roomsToJoin) {
        ws.send(JSON.stringify({ type: 'join', conversation_id: roomId }))
      }
    }

    ws.onmessage = event => {
      if (ws !== wsRef.current) return

      try {
        const data: ChatWebSocketMessage = JSON.parse(event.data)

        if (data.error) {
          console.error('WS Server Error:', data.error)
          if (data.error === 'invalid token') {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            window.location.href = '/login'
            return
          }
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

          case 'message':
            if (data.payload && data.conversation_id) {
              const message = data.payload as Message
              const convId = data.conversation_id

              // Update TanStack Query cache
              queryClient.setQueryData<Message[]>(
                ['chat', 'messages', convId],
                old => {
                  if (!old) return [message]

                  // Avoid duplicates by ID
                  if (old.some(m => m.id === message.id)) return old
                  return [...old, message]
                }
              )

              // Notify listener
              if (onMessageRef.current) {
                onMessageRef.current(message, convId)
              }
            }
            break

          case 'room_message':
            if (data.payload && data.conversation_id) {
              const message = data.payload as Message
              const convId = data.conversation_id

              // Update cache
              queryClient.setQueryData<Message[]>(
                ['chat', 'messages', convId],
                old => {
                  if (!old) return [message]
                  if (old.some(m => m.id === message.id)) return old
                  return [...old, message]
                }
              )

              // Notify listener
              if (onMessageRef.current) {
                onMessageRef.current(message, convId)
              }
            }
            break

          case 'typing':
            if (data.payload && onTypingRef.current) {
              const { conversation_id, user_id, username, is_typing } =
                data.payload
              if (conversation_id) {
                onTypingRef.current(
                  conversation_id,
                  user_id,
                  username,
                  is_typing
                )
              }
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
              const { conversation_id, participants } = data.payload
              if (Array.isArray(participants) && conversation_id) {
                onParticipantsUpdateRef.current(conversation_id, participants)
              }
            }
            break

          case 'chatroom_presence':
            if (data.payload && onChatroomPresenceRef.current) {
              onChatroomPresenceRef.current(data.payload)
            }
            break

          case 'read':
            // Invalidate messages to refresh read status
            if (data.conversation_id) {
              queryClient.invalidateQueries({
                queryKey: ['chat', 'messages', data.conversation_id],
              })
            }
            break
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    ws.onerror = error => {
      if (ws !== wsRef.current) return
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      if (ws !== wsRef.current) return

      wsRef.current = null
      setIsConnected(false)

      // Only reconnect if still authenticated
      if (isAuthenticated && hasConnectedRef.current) {
        reconnectAttemptsRef.current++
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000)
        console.log(
          `WebSocket disconnected. Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`
        )
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect()
        }, delay)
      }
    }
  }, [isAuthenticated, queryClient])

  // Connect on mount / auth change
  useEffect(() => {
    if (!isAuthenticated) {
      // Close connection on logout
      if (wsRef.current) {
        hasConnectedRef.current = false
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      setIsConnected(false)
      joinedRoomsRef.current.clear()
      setJoinedRooms(new Set())
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const joinRoom = useCallback((conversationId: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    if (!joinedRoomsRef.current.has(conversationId)) {
      ws.send(JSON.stringify({ type: 'join', conversation_id: conversationId }))
      joinedRoomsRef.current.add(conversationId)
      setJoinedRooms(new Set(joinedRoomsRef.current))
    }
  }, [])

  const leaveRoom = useCallback((conversationId: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    if (joinedRoomsRef.current.has(conversationId)) {
      ws.send(
        JSON.stringify({ type: 'leave', conversation_id: conversationId })
      )
      joinedRoomsRef.current.delete(conversationId)
      setJoinedRooms(new Set(joinedRoomsRef.current))
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

  const value: ChatContextValue = {
    isConnected,
    joinedRooms,
    joinRoom,
    leaveRoom,
    sendTyping,
    sendMessage,
    markAsRead,
    onMessage: onMessageRef.current,
    onTyping: onTypingRef.current,
    onPresence: onPresenceRef.current,
    onConnectedUsers: onConnectedUsersRef.current,
    onParticipantsUpdate: onParticipantsUpdateRef.current,
    onChatroomPresence: onChatroomPresenceRef.current,
    setOnMessage,
    setOnTyping,
    setOnPresence,
    setOnConnectedUsers,
    setOnParticipantsUpdate,
    setOnChatroomPresence,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
