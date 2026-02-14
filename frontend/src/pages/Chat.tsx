import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Hash,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Smile,
  Timer,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { Conversation, Message, User } from '@/api/types'
import { MessageList } from '@/components/chat/MessageList'
import { ParticipantsList } from '@/components/chat/ParticipantsList'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAudio } from '@/hooks/useAudio'
import {
  useAllChatrooms,
  useConversation,
  useConversations,
  useJoinChatroom,
  useJoinedChatrooms,
  useLeaveConversation,
  useMarkAsRead,
  useMessages,
  useSendMessage,
} from '@/hooks/useChat'
import { useFriends } from '@/hooks/useFriends'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import {
  shouldPlayFriendDMInMessagesView,
  shouldPlayFriendOnlineSound,
} from '@/lib/chat-sounds'
import {
  deduplicateDMConversations,
  getDirectMessageAvatar,
  getDirectMessageName,
  getInitials,
} from '@/lib/chat-utils'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

const QUICK_EMOJI = ['😀', '😂', '😍', '👍', '🔥', '🎉', '😮', '🤝']

export default function Chat() {
  const { id: urlChatId } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const isAuthenticated = useIsAuthenticated()
  const [showMobileList, setShowMobileList] = useState(!urlChatId)
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [showChatrooms, setShowChatrooms] = useState(true)
  const [leftSidebarMode, setLeftSidebarMode] = useState<'rooms' | 'dms'>(
    'rooms'
  )
  const [showParticipants, setShowParticipants] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [roomsPage, setRoomsPage] = useState(0)
  const [roomsPerPage, setRoomsPerPage] = useState(10)
  const roomsWrapperRef = useRef<HTMLDivElement>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [openRoomTabs, setOpenRoomTabs] = useState<number[]>(() => {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        const saved = localStorage.getItem(`chat_open_tabs:${user.id}`)
        return saved ? JSON.parse(saved) : []
      }
    } catch (e) {
      console.error('Failed to load open room tabs', e)
    }
    return []
  })

  // Persist open tabs to localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        localStorage.setItem(
          `chat_open_tabs:${user.id}`,
          JSON.stringify(openRoomTabs)
        )
      }
    } catch {}
  }, [openRoomTabs])

  const [unreadByRoom, setUnreadByRoom] = useState<Record<number, number>>({})

  const lastProcessedIdRef = useRef<number | null>(null)

  const [roomOnlineIds, setRoomOnlineIds] = useState<
    Record<number, Set<number>>
  >({})
  const roomAlertedRef = useRef<Set<number>>(new Set())
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const lastMarkedReadChatIdRef = useRef<number | null>(null)
  const typingDebounceRef = useRef<number | null>(null)
  const typingInactivityRef = useRef<number | null>(null)
  const remoteTypingTimeoutsRef = useRef<Record<number, number>>({})
  const queryClient = useQueryClient()

  const onlineUserIds = usePresenceStore(state => state.onlineUserIds)
  const notifiedUserIds = usePresenceStore(state => state.notifiedUserIds)
  const markNotified = usePresenceStore(state => state.markNotified)
  const setOnline = usePresenceStore(state => state.setOnline)
  const setOffline = usePresenceStore(state => state.setOffline)
  const setInitialOnlineUsers = usePresenceStore(
    state => state.setInitialOnlineUsers
  )

  const { data: friends = [], isSuccess: friendsLoaded } = useFriends({
    enabled: isAuthenticated,
  })
  const isMessagesRoute =
    location.pathname.includes('/messages') ||
    location.pathname === '/chat' ||
    location.pathname.startsWith('/chat/')

  const currentUser = useMemo(() => getCurrentUser(), [])
  const friendIds = useMemo(
    () => new Set((friendsLoaded ? friends : []).map(friend => friend.id)),
    [friends, friendsLoaded]
  )

  const {
    data: allChatrooms = [],
    isLoading: allLoading,
    error: allError,
  } = useAllChatrooms()
  const { data: allConversations = [], isLoading: conversationsLoading } =
    useConversations()
  const joinedChatroomsQuery = useJoinedChatrooms()
  const joinedChatrooms = joinedChatroomsQuery.data || []
  const joinChatroom = useJoinChatroom()
  const leaveConversation = useLeaveConversation()

  const conversations = allChatrooms as Conversation[]
  const activeRooms = useMemo(
    () => joinedChatrooms as Conversation[],
    [joinedChatrooms]
  )
  const dmConversations = useMemo(
    () =>
      deduplicateDMConversations(
        allConversations as Conversation[],
        currentUser?.id
      ),
    [allConversations, currentUser?.id]
  )
  const dmConversationById = useMemo(
    () =>
      new Map(
        dmConversations.map(conversation => [conversation.id, conversation])
      ),
    [dmConversations]
  )

  const lastScrolledChatIdRef = useRef<number | null>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollAreaRef.current
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  }, [])

  const handleScroll = useCallback(() => {
    const viewport = scrollAreaRef.current
    if (viewport) {
      const isAtBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 150
      isNearBottomRef.current = isAtBottom
    }
  }, [])

  // Initialize room unread counts from server data
  useEffect(() => {
    if (joinedChatrooms.length > 0) {
      setUnreadByRoom(prev => {
        const next = { ...prev }
        let changed = false
        for (const room of joinedChatrooms) {
          if (room.unread_count && room.unread_count > 0 && !next[room.id]) {
            next[room.id] = room.unread_count
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
  }, [joinedChatrooms])

  // Dynamic Page Size Calculation
  useEffect(() => {
    if (leftSidebarMode !== 'rooms' || !roomsWrapperRef.current) return

    const calculatePerPage = () => {
      if (roomsWrapperRef.current) {
        const height = roomsWrapperRef.current.clientHeight
        // Each condensed room item is ~32px + 2px gap = 34px
        const itemHeight = 34
        const count = Math.max(1, Math.floor(height / itemHeight))
        setRoomsPerPage(count)
      }
    }

    const observer = new ResizeObserver(calculatePerPage)
    observer.observe(roomsWrapperRef.current)
    calculatePerPage()

    return () => observer.disconnect()
  }, [leftSidebarMode])

  const selectedChatId = useMemo(
    () => (urlChatId ? Number.parseInt(urlChatId, 10) : null),
    [urlChatId]
  )

  const selectedListedConversation = useMemo(() => {
    if (!selectedChatId) return null
    return (
      conversations.find(c => c.id === selectedChatId) ||
      dmConversations.find(c => c.id === selectedChatId) ||
      activeRooms.find(c => c.id === selectedChatId) ||
      null
    )
  }, [conversations, dmConversations, activeRooms, selectedChatId])

  // Sync sidebar mode with selected conversation type on navigation
  useEffect(() => {
    if (
      selectedListedConversation &&
      selectedChatId === selectedListedConversation.id
    ) {
      if (selectedChatId !== lastProcessedIdRef.current) {
        setLeftSidebarMode(
          selectedListedConversation.is_group ? 'rooms' : 'dms'
        )
        lastProcessedIdRef.current = selectedChatId
      }
    } else if (!selectedChatId) {
      lastProcessedIdRef.current = null
    }
  }, [selectedChatId, selectedListedConversation])

  const canAccessSelectedConversation = useMemo(() => {
    if (!selectedListedConversation) return false
    if (!selectedListedConversation.is_group) return true
    if (
      (selectedListedConversation as { is_joined?: boolean }).is_joined === true
    )
      return true
    if (activeRooms.some(joined => joined.id === selectedListedConversation.id))
      return true
    if (
      currentUser &&
      selectedListedConversation.participants?.some(
        p => p.id === currentUser.id
      )
    )
      return true
    return false
  }, [selectedListedConversation, activeRooms, currentUser])

  const { data: selectedConversation } = useConversation(selectedChatId || 0, {
    enabled: canAccessSelectedConversation,
  })

  // Sync dock unread: reset only when conversation is loaded and user has access (not URL-only)
  useEffect(() => {
    if (canAccessSelectedConversation && selectedConversation) {
      useChatDockStore.getState().resetUnread(selectedConversation.id)
    }
  }, [canAccessSelectedConversation, selectedConversation])

  // Tell the dock which conversation the Chat page is viewing so it suppresses toasts
  useEffect(() => {
    useChatDockStore
      .getState()
      .setActivePageConversation(selectedChatId ?? null)
    return () => {
      useChatDockStore.getState().setActivePageConversation(null)
    }
  }, [selectedChatId])

  useEffect(() => {
    if (isMobile || selectedChatId) return
    if (leftSidebarMode === 'dms' && dmConversations.length > 0) {
      navigate(`/chat/${dmConversations[0].id}`, { replace: true })
      return
    }
    if (activeRooms.length > 0) {
      navigate(`/chat/${activeRooms[0].id}`, { replace: true })
    }
  }, [
    activeRooms,
    dmConversations,
    leftSidebarMode,
    selectedChatId,
    navigate,
    isMobile,
  ])

  useEffect(() => {
    if (!selectedChatId) return
    if (allLoading || conversationsLoading) return
    if (selectedListedConversation) return

    const fallbackId =
      (leftSidebarMode === 'dms' ? dmConversations[0]?.id : undefined) ||
      activeRooms[0]?.id ||
      dmConversations[0]?.id

    if (fallbackId) {
      navigate(`/chat/${fallbackId}`, { replace: true })
      return
    }

    navigate('/chat', { replace: true })
  }, [
    selectedChatId,
    allLoading,
    conversationsLoading,
    selectedListedConversation,
    leftSidebarMode,
    dmConversations,
    activeRooms,
    navigate,
  ])

  const { data: messages = [], isLoading } = useMessages(
    selectedChatId || 0,
    undefined,
    {
      enabled: canAccessSelectedConversation,
    }
  )

  // Handle conversation change and initial load
  useEffect(() => {
    if (selectedChatId && !isLoading && messages.length > 0) {
      if (lastScrolledChatIdRef.current !== selectedChatId) {
        // First load of this conversation
        const timer = setTimeout(() => {
          scrollToBottom(false)
          isNearBottomRef.current = true
          lastScrolledChatIdRef.current = selectedChatId
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [selectedChatId, isLoading, messages.length, scrollToBottom])

  // Handle new messages
  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      scrollToBottom(true)
    }
  }, [messages.length, scrollToBottom])

  const sendMessage = useSendMessage(selectedChatId || 0)
  const markAsRead = useMarkAsRead()

  const fallbackConversation = useMemo(() => {
    if (!selectedChatId) return null
    return (
      conversations.find(c => c.id === selectedChatId) ||
      dmConversations.find(c => c.id === selectedChatId) ||
      activeRooms.find(c => c.id === selectedChatId) ||
      null
    )
  }, [conversations, dmConversations, activeRooms, selectedChatId])

  const currentConversation = useMemo(
    () => selectedConversation || fallbackConversation,
    [selectedConversation, fallbackConversation]
  )
  const isCurrentConversationGroup = currentConversation?.is_group === true

  const isJoinedViaList = useMemo(
    () => joinedChatrooms.some(c => c.id === selectedChatId),
    [joinedChatrooms, selectedChatId]
  )

  const userIsJoined = useMemo(() => {
    if (!currentConversation) return false
    if (!currentConversation.is_group) return true
    if (isJoinedViaList) return true
    if (
      currentUser &&
      currentConversation.participants?.some(p => p.id === currentUser.id)
    )
      return true
    const fromChatrooms = (
      currentConversation as Conversation & { is_joined?: boolean }
    ).is_joined
    if (typeof fromChatrooms === 'boolean') return fromChatrooms
    return false
  }, [currentConversation, currentUser, isJoinedViaList])

  const isRoomJoined = useCallback(
    (room: Conversation & { is_joined?: boolean }) => {
      if (room.is_joined === true) return true
      if (activeRooms.some(joined => joined.id === room.id)) return true
      if (currentUser && room.participants?.some(p => p.id === currentUser.id))
        return true
      return false
    },
    [activeRooms, currentUser]
  )

  const [participants, setParticipants] = useState<
    Record<
      number,
      { id: number; username?: string; online?: boolean; typing?: boolean }
    >
  >({})
  const setRoomParticipantsInCache = useCallback(
    (conversationId: number, nextParticipants: User[]) => {
      const isJoined = currentUser
        ? nextParticipants.some(p => p.id === currentUser.id)
        : undefined
      const updateRoom = (room: Conversation & { is_joined?: boolean }) =>
        room.id === conversationId
          ? {
              ...room,
              participants: nextParticipants,
              ...(typeof isJoined === 'boolean' && { is_joined: isJoined }),
            }
          : room
      queryClient.setQueryData<Conversation[] | undefined>(
        ['chat', 'chatrooms', 'all'],
        oldRooms => oldRooms?.map(updateRoom)
      )
      queryClient.setQueryData<Conversation[] | undefined>(
        ['chat', 'chatrooms', 'joined'],
        oldRooms => oldRooms?.map(updateRoom)
      )
      queryClient.setQueryData<Conversation | undefined>(
        ['chat', 'conversation', conversationId],
        oldConversation =>
          oldConversation
            ? {
                ...oldConversation,
                participants: nextParticipants,
                ...(typeof isJoined === 'boolean' && {
                  is_joined: isJoined,
                }),
              }
            : oldConversation
      )
    },
    [queryClient, currentUser]
  )

  useEffect(() => {
    if (!selectedChatId || !canAccessSelectedConversation) return
    if (isCurrentConversationGroup) return
    if (lastMarkedReadChatIdRef.current === selectedChatId) return
    lastMarkedReadChatIdRef.current = selectedChatId
    markAsRead.mutate(selectedChatId)
  }, [
    selectedChatId,
    canAccessSelectedConversation,
    isCurrentConversationGroup,
    markAsRead,
  ])

  useEffect(() => {
    if (!selectedChatId || !currentConversation) {
      setParticipants({})
      return
    }

    const usersList: User[] = currentConversation.participants || []
    const map: Record<
      number,
      { id: number; username?: string; online?: boolean; typing?: boolean }
    > = {}

    const shouldIncludeCurrentUser =
      !!currentUser &&
      (userIsJoined || usersList.some(u => u.id === currentUser.id))

    if (currentUser && shouldIncludeCurrentUser) {
      map[currentUser.id] = {
        id: currentUser.id,
        username: currentUser.username,
        online: true,
        typing: false,
      }
    }

    for (const u of usersList) {
      if (!currentUser || u.id !== currentUser.id) {
        map[u.id] = {
          id: u.id,
          username: u.username,
          online: onlineUserIds.has(u.id),
          typing: false,
        }
      }
    }

    setParticipants(map)
  }, [
    selectedChatId,
    currentConversation,
    currentUser,
    userIsJoined,
    onlineUserIds,
  ])

  const { playFriendOnlineSound, playNewMessageSound, playRoomAlertSound } =
    useAudio()

  const onPresence = useCallback(
    (userId: number, username: string, status: string) => {
      const online = status === 'online' || status === 'connected'
      console.log(
        `Presence update: user=${userId} (${username}) status=${status} (online=${online})`
      )

      if (
        shouldPlayFriendOnlineSound(
          userId,
          status,
          currentUser?.id,
          notifiedUserIds,
          friends.map(f => f.id)
        )
      ) {
        console.log(`Playing friend online sound for ${username}`)
        markNotified(userId)
        playFriendOnlineSound()
        toast.success(`${username} is online!`)
      }

      setParticipants(prev => ({
        ...prev,
        [userId]: { ...(prev?.[userId] || { id: userId, username }), online },
      }))
      if (online) setOnline(userId)
      else setOffline(userId)
    },
    [
      setOnline,
      setOffline,
      currentUser?.id,
      playFriendOnlineSound,
      friends,
      notifiedUserIds,
      markNotified,
    ]
  )

  const onConnectedUsers = useCallback(
    (userIds: number[]) => {
      for (const uid of userIds) {
        markNotified(uid)
      }
      setInitialOnlineUsers(userIds)
    },
    [setInitialOnlineUsers, markNotified]
  )

  const onParticipantsUpdate = useCallback(
    (participantsList: User[]) => {
      const map: Record<
        number,
        { id: number; username?: string; online?: boolean; typing?: boolean }
      > = {}
      if (currentUser && userIsJoined) {
        map[currentUser.id] = {
          id: currentUser.id,
          username: currentUser.username,
          online: true,
          typing: false,
        }
      }
      for (const u of participantsList) {
        if (!currentUser || u.id !== currentUser.id) {
          map[u.id] = {
            id: u.id,
            username: u.username,
            online: onlineUserIds.has(u.id),
            typing: false,
          }
        }
      }
      setParticipants(map)
    },
    [currentUser, userIsJoined, onlineUserIds]
  )

  const onRoomMessage = useCallback(
    (roomMessage: Message, conversationId: number) => {
      queryClient.setQueryData<Message[]>(
        ['chat', 'messages', conversationId],
        oldMessages => {
          if (!oldMessages) return [roomMessage]
          if (oldMessages.some(m => m.id === roomMessage.id)) return oldMessages

          // If this is our own message coming back via WebSocket, replace the optimistic one
          const tempId = (roomMessage.metadata as Record<string, unknown>)
            ?.tempId
          if (tempId) {
            const hasOptimistic = oldMessages.some(
              m => (m.metadata as Record<string, unknown>)?.tempId === tempId
            )
            if (hasOptimistic) {
              return oldMessages.map(m =>
                (m.metadata as Record<string, unknown>)?.tempId === tempId
                  ? roomMessage
                  : m
              )
            }
          }

          return [...oldMessages, roomMessage]
        }
      )

      queryClient.setQueryData<Conversation[] | undefined>(
        ['chat', 'chatrooms', 'all'],
        oldRooms =>
          oldRooms?.map(room =>
            room.id === conversationId
              ? {
                  ...room,
                  last_message: roomMessage,
                }
              : room
          )
      )
      queryClient.setQueryData<Conversation[] | undefined>(
        ['chat', 'chatrooms', 'joined'],
        oldRooms =>
          oldRooms?.map(room =>
            room.id === conversationId
              ? {
                  ...room,
                  last_message: roomMessage,
                }
              : room
          )
      )

      if (conversationId === selectedChatId) {
        setUnreadByRoom(prev =>
          prev[conversationId]
            ? {
                ...prev,
                [conversationId]: 0,
              }
            : prev
        )
        return
      }

      if (roomMessage.sender_id === currentUser?.id) {
        return
      }

      const isJoinedRoom = activeRooms.some(room => room.id === conversationId)
      if (!isJoinedRoom) {
        return
      }

      if (!roomAlertedRef.current.has(conversationId)) {
        roomAlertedRef.current.add(conversationId)
        playRoomAlertSound()
        const roomName =
          activeRooms.find(r => r.id === conversationId)?.name || 'a room'
        toast.info(`New message in ${roomName}`)
      }

      setUnreadByRoom(prev => ({
        ...prev,
        [conversationId]: (prev[conversationId] || 0) + 1,
      }))
    },
    [
      queryClient,
      selectedChatId,
      currentUser?.id,
      playRoomAlertSound,
      activeRooms,
    ]
  )

  const onChatroomPresence = useCallback(
    (payload: {
      conversation_id: number
      participants: User[]
      member_count?: number
      user_id?: number
      username?: string
      action?: string
      online_user_ids?: number[]
    }) => {
      if (!payload?.conversation_id) return

      setRoomParticipantsInCache(
        payload.conversation_id,
        payload.participants || []
      )

      // Sync per-room online tracking from authoritative backend data
      if (Array.isArray(payload.online_user_ids)) {
        const onlineSet = new Set(payload.online_user_ids)
        setRoomOnlineIds(prev => ({
          ...prev,
          [payload.conversation_id]: onlineSet,
        }))

        // Also sync the global presence store so other UI stays consistent
        for (const uid of payload.online_user_ids) {
          setOnline(uid)
        }
        // Mark participants NOT in online_user_ids as offline
        for (const p of payload.participants || []) {
          if (!onlineSet.has(p.id)) {
            setOffline(p.id)
          }
        }
      }

      if (payload.conversation_id === selectedChatId) {
        onParticipantsUpdate(payload.participants || [])
      }
    },
    [
      onParticipantsUpdate,
      selectedChatId,
      setRoomParticipantsInCache,
      setOnline,
      setOffline,
    ]
  )

  // Use shared ChatProvider WebSocket (no duplicate connection)
  const {
    joinRoom,
    leaveRoom,
    getUnread,
    incrementUnread,
    clearUnread,
    sendTyping: ctxSendTyping,
    joinedRooms,
    setOnMessage: _setOnMessage,
    setOnTyping: _setOnTyping,
    setOnPresence: _setOnPresence,
    setOnConnectedUsers: _setOnConnectedUsers,
    setOnParticipantsUpdate: _setOnParticipantsUpdate,
    setOnChatroomPresence: _setOnChatroomPresence,
    subscribeOnMessage,
    subscribeOnTyping,
    subscribeOnPresence,
    subscribeOnConnectedUsers,
    subscribeOnParticipantsUpdate,
    subscribeOnChatroomPresence,
  } = useChatContext()

  const wsIsJoined =
    !!selectedChatId &&
    canAccessSelectedConversation &&
    userIsJoined &&
    joinedRooms.has(selectedChatId)

  // Rooms to stay in: selected conversation (if joined) + all joined rooms (to track unread)
  const roomsToJoin = useMemo(() => {
    const set = new Set<number>()
    // Add all active (joined) rooms
    for (const room of activeRooms) {
      set.add(room.id)
    }
    // Ensure current tab is included even if not fully synced to activeRooms yet
    if (canAccessSelectedConversation && selectedChatId && userIsJoined) {
      set.add(selectedChatId)
    }
    return Array.from(set)
  }, [activeRooms, canAccessSelectedConversation, selectedChatId, userIsJoined])

  const prevRoomsToJoinRef = useRef<number[]>([])
  useEffect(() => {
    // Join all currently targeted rooms
    for (const id of roomsToJoin) {
      joinRoom(id)
    }

    // ONLY leave rooms that were explicitly removed from the targeted list
    // (This ensures we don't leave all rooms when navigating away from the page)
    const removedIds = prevRoomsToJoinRef.current.filter(
      id => !roomsToJoin.includes(id)
    )
    for (const id of removedIds) {
      leaveRoom(id)
    }
    prevRoomsToJoinRef.current = roomsToJoin
  }, [roomsToJoin, joinRoom, leaveRoom])

  // Register WS callbacks; cleanup on unmount
  useEffect(() => {
    const unsubMessage = subscribeOnMessage((message, conversationId) => {
      const isRoom =
        activeRooms.some(r => r.id === conversationId) ||
        (allChatrooms as Conversation[]).some(
          (r: Conversation) => r.id === conversationId
        )

      if (isRoom) {
        onRoomMessage(message, conversationId)
      } else {
        // Handle Direct Messages
        if (message.sender_id !== currentUser?.id) {
          if (conversationId === selectedChatId) {
            clearUnread(conversationId)
          } else {
            const newUnreadCount = incrementUnread(conversationId)
            const previousUnreadCount = newUnreadCount - 1
            const conversation = dmConversationById.get(conversationId)
            const otherUserId = conversation?.participants?.find(
              participant => participant.id !== currentUser?.id
            )?.id
            const isFriendDM =
              !!conversation &&
              !conversation.is_group &&
              friendsLoaded &&
              typeof otherUserId === 'number' &&
              friendIds.has(otherUserId)

            if (
              shouldPlayFriendDMInMessagesView(
                conversation
                  ? { ...conversation, is_friend_dm: isFriendDM }
                  : undefined,
                isMessagesRoute,
                previousUnreadCount
              )
            ) {
              playNewMessageSound()
            }

            toast.info(`New message from ${message.sender?.username ?? 'User'}`)
          }
        }

        // Update DM list cache so last_message is current
        queryClient.setQueryData<Conversation[]>(
          ['chat', 'conversations'],
          old =>
            old?.map(conv =>
              conv.id === conversationId
                ? { ...conv, last_message: message }
                : conv
            )
        )
      }
    })
    const unsubTyping = subscribeOnTyping(
      (convId, userId, username, isTyping, expiresInMs) => {
        if (convId !== selectedChatId) return
        const timeoutMs = expiresInMs ?? 5000
        const timeoutMap = remoteTypingTimeoutsRef.current
        if (timeoutMap[userId]) {
          window.clearTimeout(timeoutMap[userId])
          delete timeoutMap[userId]
        }
        setParticipants(prev => ({
          ...prev,
          [userId]: {
            ...(prev?.[userId] || { id: userId, username }),
            typing: isTyping,
            online: true,
          },
        }))
        if (isTyping) {
          timeoutMap[userId] = window.setTimeout(() => {
            setParticipants(prev => ({
              ...prev,
              [userId]: {
                ...(prev?.[userId] || { id: userId, username }),
                typing: false,
                online: true,
              },
            }))
            delete remoteTypingTimeoutsRef.current[userId]
          }, timeoutMs)
        }
      }
    )

    const unsubPresence = subscribeOnPresence(onPresence)
    const unsubConnectedUsers = subscribeOnConnectedUsers(onConnectedUsers)
    const unsubParticipants = subscribeOnParticipantsUpdate(
      (convId, participantsList) => {
        if (convId === selectedChatId) {
          onParticipantsUpdate(participantsList)
        }
      }
    )
    const unsubChatroomPresence =
      subscribeOnChatroomPresence(onChatroomPresence)

    return () => {
      unsubMessage()
      unsubTyping()
      unsubPresence()
      unsubConnectedUsers()
      unsubParticipants()
      unsubChatroomPresence()
      const timeoutMap = remoteTypingTimeoutsRef.current
      for (const timeoutID of Object.values(timeoutMap)) {
        window.clearTimeout(timeoutID)
      }
      remoteTypingTimeoutsRef.current = {}
    }
  }, [
    selectedChatId,
    currentUser?.id,
    activeRooms,
    allChatrooms,
    onRoomMessage,
    onPresence,
    onConnectedUsers,
    onParticipantsUpdate,
    onChatroomPresence,
    clearUnread,
    dmConversationById,
    friendIds,
    friendsLoaded,
    incrementUnread,
    isMessagesRoute,
    playNewMessageSound,
    queryClient,
    subscribeOnChatroomPresence,
    subscribeOnConnectedUsers,
    subscribeOnMessage,
    subscribeOnParticipantsUpdate,
    subscribeOnPresence,
    subscribeOnTyping,
  ])

  useEffect(() => {
    if (!selectedChatId) return

    if (isCurrentConversationGroup) {
      setOpenRoomTabs(prev =>
        prev.includes(selectedChatId) ? prev : [...prev, selectedChatId]
      )
      roomAlertedRef.current.delete(selectedChatId)
    }

    setUnreadByRoom(prev =>
      prev[selectedChatId]
        ? {
            ...prev,
            [selectedChatId]: 0,
          }
        : prev
    )
    clearUnread(selectedChatId)
  }, [selectedChatId, isCurrentConversationGroup, clearUnread])

  useEffect(() => {
    if (!joinedChatroomsQuery.isSuccess) return

    setOpenRoomTabs(prev => {
      const next = prev.filter(roomId =>
        activeRooms.some(room => room.id === roomId)
      )
      return next.length === prev.length ? prev : next
    })
  }, [activeRooms, joinedChatroomsQuery.isSuccess])

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !selectedChatId || !currentUser) return
    const tempId = crypto.randomUUID()
    const messageContent = newMessage

    setNewMessage('')
    setMentionQuery('')
    setShowEmojiPicker(false)
    ctxSendTyping(selectedChatId, false)
    scrollToBottom(true)
    sendMessage.mutate(
      { content: messageContent, message_type: 'text', metadata: { tempId } },
      {
        onError: error => {
          console.error('Failed to send message:', error)
          setMessageError('Failed to send message')
        },
      }
    )
  }, [
    newMessage,
    selectedChatId,
    currentUser,
    sendMessage,
    ctxSendTyping,
    scrollToBottom,
  ])

  const handleInputChange = useCallback(
    (value: string) => {
      setNewMessage(value)
      const mentionMatch = value.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/)
      setMentionQuery(mentionMatch ? (mentionMatch[1] ?? '') : '')
      if (!selectedChatId) return

      if (typingDebounceRef.current) {
        window.clearTimeout(typingDebounceRef.current)
      }
      typingDebounceRef.current = window.setTimeout(() => {
        if (value.trim()) ctxSendTyping(selectedChatId, true)
      }, 500)

      if (typingInactivityRef.current) {
        window.clearTimeout(typingInactivityRef.current)
      }
      typingInactivityRef.current = window.setTimeout(() => {
        ctxSendTyping(selectedChatId, false)
      }, 5000)
    },
    [selectedChatId, ctxSendTyping]
  )

  const applyMention = useCallback((username: string) => {
    setNewMessage(prev =>
      prev.replace(/(?:^|\s)@[a-zA-Z0-9_]*$/, match =>
        match.startsWith(' ') ? ` @${username} ` : `@${username} `
      )
    )
    setMentionQuery('')
  }, [])

  const appendEmoji = useCallback((emoji: string) => {
    setNewMessage(prev => `${prev}${emoji}`)
    setShowEmojiPicker(false)
  }, [])

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage]
  )

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) {
        window.clearTimeout(typingDebounceRef.current)
      }
      if (typingInactivityRef.current) {
        window.clearTimeout(typingInactivityRef.current)
      }
    }
  }, [])

  const handleJoinConversation = useCallback(
    (id: number) => {
      joinChatroom.mutate(id, {
        onSuccess: () => {
          // Optimistically update is_joined + participants in cache
          queryClient.setQueryData<Conversation[]>(
            ['chat', 'chatrooms', 'all'],
            old =>
              old?.map(room =>
                room.id === id
                  ? {
                      ...room,
                      is_joined: true,
                      participants:
                        currentUser &&
                        !room.participants?.some(p => p.id === currentUser.id)
                          ? [
                              ...(room.participants || []),
                              {
                                id: currentUser.id,
                                username: currentUser.username,
                              } as User,
                            ]
                          : room.participants,
                    }
                  : room
              )
          )
          queryClient.setQueryData<Conversation[]>(
            ['chat', 'chatrooms', 'joined'],
            old => {
              const list = old ?? []
              if (list.some(r => r.id === id)) return list
              const room = queryClient
                .getQueryData<Conversation[]>(['chat', 'chatrooms', 'all'])
                ?.find(r => r.id === id)
              const updated =
                room &&
                currentUser &&
                !room.participants?.some(p => p.id === currentUser.id)
                  ? {
                      ...room,
                      is_joined: true,
                      participants: [
                        ...(room.participants || []),
                        {
                          id: currentUser.id,
                          username: currentUser.username,
                        } as User,
                      ],
                    }
                  : room
                    ? { ...room, is_joined: true }
                    : null
              return updated ? [...list, updated] : list
            }
          )
          setLeftSidebarMode('rooms')
          setOpenRoomTabs(prev => (prev.includes(id) ? prev : [...prev, id]))
          navigate(`/chat/${id}`)
        },
      })
    },
    [joinChatroom, navigate, queryClient, currentUser]
  )

  const handleSelectConversation = useCallback(
    (id: number) => {
      const conv = (conversations.find(c => c.id === id) ||
        activeRooms.find(c => c.id === id)) as
        | (Conversation & {
            is_joined?: boolean
          })
        | null
      if (!conv) {
        navigate(`/chat/${id}`)
        return
      }

      setLeftSidebarMode('rooms')

      if (conv.is_group && !isRoomJoined(conv)) {
        handleJoinConversation(id)
      } else {
        setOpenRoomTabs(prev => (prev.includes(id) ? prev : [...prev, id]))
        setUnreadByRoom(prev =>
          prev[id]
            ? {
                ...prev,
                [id]: 0,
              }
            : prev
        )
        navigate(`/chat/${id}`)
      }
    },
    [conversations, activeRooms, navigate, handleJoinConversation, isRoomJoined]
  )

  const maxRoomsPage = Math.max(
    0,
    Math.ceil(conversations.length / roomsPerPage) - 1
  )

  const handleNavigatePage = useCallback(
    (direction: 'prev' | 'next') => {
      if (direction === 'prev') {
        setRoomsPage(prev => Math.max(0, prev - 1))
      } else {
        setRoomsPage(prev => Math.min(maxRoomsPage, prev + 1))
      }
    },
    [maxRoomsPage]
  )

  const pagedRooms = useMemo(() => {
    const start = roomsPage * roomsPerPage
    return conversations.slice(start, start + roomsPerPage)
  }, [conversations, roomsPage, roomsPerPage])

  // Reset page if it goes out of bounds (e.g. after resize)
  useEffect(() => {
    if (roomsPage > maxRoomsPage) {
      setRoomsPage(maxRoomsPage)
    }
  }, [roomsPage, maxRoomsPage])

  const handleCloseRoomTab = useCallback(
    (roomId: number) => {
      let nextSelectedRoomId: number | null = null
      setOpenRoomTabs(prev => {
        const remaining = prev.filter(id => id !== roomId)
        if (selectedChatId === roomId) {
          nextSelectedRoomId =
            remaining[remaining.length - 1] ||
            activeRooms.find(room => room.id !== roomId)?.id ||
            null
        }
        return remaining
      })

      setUnreadByRoom(prev => {
        if (!(roomId in prev)) return prev
        const next = { ...prev }
        delete next[roomId]
        return next
      })
      roomAlertedRef.current.delete(roomId)

      // Leave the room on the backend so other users see updated counts
      leaveConversation.mutate(roomId)

      if (selectedChatId === roomId) {
        if (nextSelectedRoomId) {
          navigate(`/chat/${nextSelectedRoomId}`)
        } else {
          navigate('/chat')
        }
      }
    },
    [selectedChatId, activeRooms, navigate, leaveConversation]
  )

  const handleSelectDirectMessage = useCallback(
    (conversationId: number) => {
      setLeftSidebarMode('dms')
      navigate(`/chat/${conversationId}`)
    },
    [navigate]
  )

  const getDmName = useCallback(
    (conversation: Conversation) =>
      getDirectMessageName(conversation, currentUser?.id),
    [currentUser?.id]
  )

  const getDmAvatar = useCallback(
    (conversation: Conversation) =>
      getDirectMessageAvatar(conversation, currentUser?.id),
    [currentUser?.id]
  )

  const selectedRoomOnlineCount = useMemo(
    () =>
      Object.values(participants).filter(
        participant => participant.online || onlineUserIds.has(participant.id)
      ).length,
    [participants, onlineUserIds]
  )
  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery && !newMessage.endsWith('@')) return []
    const normalized = mentionQuery.toLowerCase()
    return (currentConversation?.participants || [])
      .filter(participant => participant.id !== currentUser?.id)
      .filter(participant =>
        normalized
          ? participant.username?.toLowerCase().startsWith(normalized)
          : true
      )
      .slice(0, 5)
  }, [mentionQuery, newMessage, currentConversation, currentUser?.id])
  const _getRoomOnlineCount = useCallback(
    (room: Conversation) => {
      // Use per-room online IDs from chatroom_presence events (authoritative)
      const roomOnline = roomOnlineIds[room.id]
      if (roomOnline) return roomOnline.size

      // Fallback to global presence store
      const roomParticipants = room.participants || []
      if (roomParticipants.length === 0) return 0
      return roomParticipants.filter(participant => {
        if (room.id === selectedChatId && participants[participant.id]) {
          return (
            participants[participant.id].online ||
            onlineUserIds.has(participant.id)
          )
        }
        return onlineUserIds.has(participant.id)
      }).length
    },
    [roomOnlineIds, onlineUserIds, participants, selectedChatId]
  )

  const typingUsers = useMemo(() => {
    return Object.values(participants)
      .filter(p => p.typing && p.id !== currentUser?.id)
      .map(p => p.username || 'Someone')
  }, [participants, currentUser?.id])

  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden bg-background'>
      {allError && (
        <div className='border-b border-destructive bg-destructive/15 p-3'>
          <p className='text-sm text-destructive'>
            Error loading chatrooms: {String(allError)}
          </p>
        </div>
      )}

      <div className='flex min-h-0 flex-1 overflow-hidden'>
        <aside
          className={cn(
            'shrink-0 overflow-hidden bg-card/40 transition-all duration-200',
            isMobile
              ? showMobileList
                ? 'flex flex-1 flex-col'
                : 'hidden'
              : cn(
                  'hidden md:flex md:flex-col',
                  showChatrooms
                    ? 'w-64 2xl:w-80 border-r border-border/70'
                    : 'w-0 border-r-0'
                )
          )}
        >
          <div className='flex h-12 items-center border-b border-border/70 px-2'>
            {!isMobile && (
              <button
                type='button'
                onClick={() => setShowChatrooms(false)}
                className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground'
                aria-label='Collapse sidebar'
              >
                <PanelLeftClose className='h-4 w-4' />
              </button>
            )}
            <h2 className='ml-2 flex flex-col min-w-0'>
              <div className='flex items-center gap-2 text-sm font-semibold'>
                {leftSidebarMode === 'rooms' ? (
                  <Hash className='h-4 w-4 text-primary shrink-0' />
                ) : (
                  <MessageCircle className='h-4 w-4 text-primary shrink-0' />
                )}
                <span className='truncate'>
                  {leftSidebarMode === 'rooms'
                    ? currentConversation && isCurrentConversationGroup
                      ? currentConversation.name
                      : 'Chatrooms'
                    : 'Direct Messages'}
                </span>
              </div>
              {leftSidebarMode === 'rooms' &&
                currentConversation &&
                isCurrentConversationGroup && (
                  <p className='text-[10px] text-muted-foreground'>
                    {selectedRoomOnlineCount} members online
                  </p>
                )}
            </h2>
          </div>

          <div className='border-b border-border/70 p-2'>
            <div className='grid grid-cols-2 gap-1'>
              <button
                type='button'
                onClick={() => setLeftSidebarMode('rooms')}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
                  leftSidebarMode === 'rooms'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                Rooms
              </button>
              <button
                type='button'
                onClick={() => setLeftSidebarMode('dms')}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
                  leftSidebarMode === 'dms'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                DM
              </button>
            </div>
          </div>

          {leftSidebarMode === 'rooms' ? (
            <div className='flex flex-1 flex-col overflow-hidden'>
              <div className='flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2'>
                <div className='flex items-center gap-3'>
                  <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                    Page {roomsPage + 1} of {maxRoomsPage + 1}
                  </p>
                  {isMobile && (
                    <button
                      type='button'
                      onClick={() => setShowMobileList(false)}
                      className='rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/25'
                    >
                      Exit List
                    </button>
                  )}
                </div>
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
                    disabled={roomsPage === 0}
                    onClick={() => handleNavigatePage('prev')}
                    className='inline-flex h-6 w-6 items-center justify-center rounded border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-30'
                    title='Previous page'
                  >
                    <ChevronLeft className='h-3.5 w-3.5' />
                  </button>
                  <button
                    type='button'
                    disabled={roomsPage === maxRoomsPage}
                    onClick={() => handleNavigatePage('next')}
                    className='inline-flex h-6 w-6 items-center justify-center rounded border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-30'
                    title='Next page'
                  >
                    <ChevronRight className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>

              <div
                className='min-h-0 flex-1 overflow-hidden p-1'
                ref={roomsWrapperRef}
              >
                {allLoading ? (
                  <div className='p-4 text-center text-xs text-muted-foreground'>
                    Loading rooms...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className='p-4 text-center text-xs text-muted-foreground'>
                    No rooms available.
                  </div>
                ) : (
                  <div className='space-y-0.5'>
                    {pagedRooms.map(room => {
                      const joined = isRoomJoined(room)
                      const selected = selectedChatId === room.id
                      const onlineCount = _getRoomOnlineCount(room)
                      const hasUnread = (unreadByRoom[room.id] || 0) > 0

                      return (
                        <button
                          key={`room-item-${room.id}`}
                          type='button'
                          onClick={() => handleSelectConversation(room.id)}
                          style={{ height: '32px' }}
                          className={cn(
                            'group relative flex w-full items-center gap-2 rounded-md border px-2 py-0 transition-all',
                            selected
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : hasUnread
                                ? 'border-primary/20 bg-primary/5 text-foreground animate-pulse shadow-[inset_0_0_8px_rgba(59,130,246,0.15)]'
                                : 'border-transparent hover:bg-muted/60'
                          )}
                        >
                          <Hash
                            className={cn(
                              'h-3 w-3 shrink-0',
                              selected || hasUnread
                                ? 'text-primary'
                                : 'text-muted-foreground'
                            )}
                          />
                          <div className='min-w-0 flex-1 overflow-hidden'>
                            <div className='flex items-center justify-between gap-2'>
                              <span
                                className={cn(
                                  'truncate text-[12px]',
                                  selected || hasUnread
                                    ? 'font-bold'
                                    : 'font-medium'
                                )}
                              >
                                {room.name || `Room ${room.id}`}
                              </span>
                              <div className='flex items-center gap-1.5'>
                                {hasUnread && (
                                  <span className='h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.6)]' />
                                )}
                                {onlineCount > 0 && (
                                  <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500' />
                                )}
                              </div>
                            </div>
                          </div>
                          {!joined && (
                            <span className='rounded bg-primary/10 px-1 py-0.5 text-[8px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity'>
                              JOIN
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className='border-b border-border/70 px-3 py-2'>
                <p className='text-[11px] text-muted-foreground'>
                  {dmConversations.length} conversations
                </p>
              </div>
              <ScrollArea className='min-h-0 flex-1'>
                <div className='space-y-1.5 p-2'>
                  {conversationsLoading ? (
                    <div className='p-4 text-center text-xs text-muted-foreground'>
                      Loading conversations...
                    </div>
                  ) : dmConversations.length === 0 ? (
                    <div className='p-4 text-center text-xs text-muted-foreground'>
                      No direct conversations yet.
                    </div>
                  ) : (
                    dmConversations.map(conversation => {
                      const otherUser = conversation.participants?.find(
                        p => p.id !== currentUser?.id
                      )
                      const isOnline = otherUser
                        ? onlineUserIds.has(otherUser.id)
                        : false
                      const isSelected = selectedChatId === conversation.id
                      const hasUnread = getUnread(conversation.id) > 0

                      return (
                        <button
                          key={`dm-${conversation.id}`}
                          type='button'
                          onClick={() =>
                            handleSelectDirectMessage(conversation.id)
                          }
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                            isSelected
                              ? 'border-primary/30 bg-primary/10'
                              : hasUnread
                                ? 'border-primary/20 bg-primary/5 animate-pulse'
                                : 'border-transparent hover:border-border/60 hover:bg-muted/60'
                          )}
                        >
                          <div className='relative'>
                            <Avatar className='h-7 w-7 border'>
                              <AvatarImage src={getDmAvatar(conversation)} />
                              <AvatarFallback className='text-[10px]'>
                                {getInitials(getDmName(conversation))}
                              </AvatarFallback>
                            </Avatar>
                            {hasUnread && (
                              <span className='absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background shadow-[0_0_8px_rgba(59,130,246,0.6)]' />
                            )}
                          </div>
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2'>
                              <p
                                className={cn(
                                  'truncate text-[12px]',
                                  isSelected || hasUnread
                                    ? 'font-bold'
                                    : 'font-semibold'
                                )}
                              >
                                {getDmName(conversation)}
                              </p>
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 shrink-0 rounded-full',
                                  isOnline ? 'bg-emerald-500' : 'bg-gray-400'
                                )}
                              />
                            </div>
                            {conversation.last_message && (
                              <p
                                className={cn(
                                  'truncate text-[10px]',
                                  hasUnread
                                    ? 'text-foreground font-medium'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {conversation.last_message.content}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </aside>

        <section
          className={cn(
            'min-h-0 flex-1 flex-col overflow-hidden',
            isMobile && showMobileList ? 'hidden' : 'flex'
          )}
        >
          <div className='flex h-12 items-center gap-2 border-b border-border/70 bg-card/35 px-3'>
            {isMobile && (
              <button
                type='button'
                onClick={() => {
                  setShowMobileList(true)
                }}
                className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground'
                aria-label='Back to conversations'
              >
                <ChevronLeft className='h-4 w-4' />
                <span className='text-xs font-semibold'>Rooms</span>
              </button>
            )}
            {!isMobile && !showChatrooms && (
              <button
                type='button'
                onClick={() => setShowChatrooms(true)}
                className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground'
                aria-label='Expand sidebar'
              >
                <PanelLeftOpen className='h-4 w-4' />
              </button>
            )}

            {openRoomTabs.length > 0 ? (
              <div className='flex flex-1 items-center gap-2 overflow-x-auto py-1'>
                {openRoomTabs.map(roomId => {
                  const room =
                    conversations.find(c => c.id === roomId) ||
                    activeRooms.find(c => c.id === roomId)
                  if (!room) return null
                  const unread = unreadByRoom[roomId] || 0
                  const selected = selectedChatId === roomId
                  return (
                    <div
                      key={`room-tab-${roomId}`}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full border pr-1 text-xs font-semibold transition-colors',
                        selected
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : unread > 0
                            ? 'border-primary/50 bg-primary/5 shadow-[0_0_12px_rgba(59,130,246,0.25)] animate-pulse'
                            : 'border-border/70 bg-card hover:bg-muted/60'
                      )}
                    >
                      <button
                        type='button'
                        onClick={() => handleSelectConversation(roomId)}
                        className='inline-flex items-center gap-2 px-3 py-1.5'
                      >
                        <Hash
                          className={cn(
                            'h-3 w-3',
                            unread > 0 && !selected && 'text-primary'
                          )}
                        />
                        <span
                          className={cn(
                            'max-w-28 truncate',
                            unread > 0 && !selected && 'font-bold'
                          )}
                        >
                          {room.name || `Room ${room.id}`}
                        </span>
                        {unread > 0 && (
                          <span className='h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.6)]' />
                        )}
                      </button>
                      <button
                        type='button'
                        aria-label={`Close room tab ${room.name || room.id}`}
                        className='inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                        onClick={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleCloseRoomTab(roomId)
                        }}
                      >
                        <X className='h-3 w-3' />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : !currentConversation ? (
              <p className='text-sm font-medium text-muted-foreground'>
                {leftSidebarMode === 'rooms'
                  ? 'Select a chatroom'
                  : 'Select a direct message'}
              </p>
            ) : null}

            {currentConversation && (
              <button
                type='button'
                onClick={() => setShowTimestamps(!showTimestamps)}
                className='ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground'
                title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
              >
                {showTimestamps ? (
                  <Clock className='h-4 w-4' />
                ) : (
                  <Timer className='h-4 w-4 text-muted-foreground/50' />
                )}
              </button>
            )}
          </div>

          <ScrollArea
            className='min-h-0 flex-1'
            ref={scrollAreaRef}
            onScroll={handleScroll}
          >
            <div
              className={cn(
                'mx-auto w-full p-4',
                isCurrentConversationGroup
                  ? 'max-w-full 2xl:max-w-6xl'
                  : 'max-w-3xl'
              )}
            >
              <MessageList
                messages={messages}
                isLoading={isLoading}
                currentUserId={currentUser?.id}
                isDirectMessage={!isCurrentConversationGroup}
                showReadReceipts={!isCurrentConversationGroup}
                conversationId={selectedChatId || undefined}
                isIRCStyle={isCurrentConversationGroup}
                showTimestamps={showTimestamps}
                scrollElement={scrollAreaRef.current}
              />
            </div>
          </ScrollArea>

          <div className='border-t border-border/70 bg-card/25 p-3'>
            <div
              className={cn(
                'mx-auto w-full',
                isCurrentConversationGroup
                  ? 'max-w-full 2xl:max-w-6xl'
                  : 'max-w-3xl'
              )}
            >
              {messageError && (
                <p className='mb-2 px-1 text-xs font-medium text-destructive'>
                  {messageError}
                </p>
              )}

              <TypingIndicator
                typingUsers={typingUsers}
                className='mb-2 px-1'
              />

              {userIsJoined ? (
                <div className='relative flex items-center gap-2'>
                  <div className='relative flex-1'>
                    <Input
                      placeholder={
                        wsIsJoined ? 'Type a message...' : 'Connecting...'
                      }
                      value={newMessage}
                      onChange={e => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyPress}
                      disabled={!wsIsJoined}
                      className='h-10 flex-1 rounded-full border-border/60 bg-card pr-12'
                    />
                    <button
                      type='button'
                      onClick={() => setShowEmojiPicker(prev => !prev)}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground'
                      title='Insert emoji'
                    >
                      <Smile className='h-4 w-4' />
                    </button>
                    {showEmojiPicker && (
                      <div className='absolute bottom-12 right-0 z-20 flex max-w-52 flex-wrap gap-1 rounded-lg border border-border bg-card p-2 shadow-lg'>
                        {QUICK_EMOJI.map(emoji => (
                          <button
                            key={`chat-emoji-${emoji}`}
                            type='button'
                            onClick={() => appendEmoji(emoji)}
                            className='inline-flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-muted'
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    {mentionSuggestions.length > 0 && (
                      <div className='absolute bottom-12 left-0 z-20 w-full rounded-lg border border-border bg-card p-1 shadow-lg'>
                        {mentionSuggestions.map(participant => (
                          <button
                            key={`chat-mention-${participant.id}`}
                            type='button'
                            onClick={() => applyMention(participant.username)}
                            className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted'
                          >
                            <span className='font-semibold'>
                              @{participant.username}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || !wsIsJoined}
                    className='h-10 w-10 rounded-full p-0'
                  >
                    <Send className='h-4 w-4' />
                  </Button>
                </div>
              ) : (
                <div className='flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2'>
                  <p className='text-xs text-muted-foreground'>
                    Join this room to send messages.
                  </p>
                  <Button
                    onClick={() =>
                      selectedChatId && handleJoinConversation(selectedChatId)
                    }
                    disabled={joinChatroom.isPending}
                    size='sm'
                    className='rounded-lg'
                  >
                    {joinChatroom.isPending ? 'Joining...' : 'Join'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside
          className={cn(
            'hidden shrink-0 border-l border-border/70 bg-card/35 transition-all duration-200 lg:flex lg:flex-col',
            showParticipants ? 'w-60 2xl:w-72' : 'w-12'
          )}
        >
          <div className='flex h-12 items-center border-b border-border/70 px-2'>
            {showParticipants && (
              <h2 className='ml-1 flex items-center gap-2 text-sm font-semibold'>
                <Users className='h-4 w-4' />
                Members
              </h2>
            )}
            <button
              type='button'
              onClick={() => setShowParticipants(prev => !prev)}
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
                showParticipants ? 'ml-auto' : 'mx-auto'
              )}
              aria-label={
                showParticipants
                  ? 'Collapse members panel'
                  : 'Expand members panel'
              }
            >
              {showParticipants ? (
                <PanelRightClose className='h-4 w-4' />
              ) : (
                <PanelRightOpen className='h-4 w-4' />
              )}
            </button>
          </div>
          {showParticipants && (
            <ScrollArea className='min-h-0 flex-1'>
              <div className='p-2'>
                <ParticipantsList
                  participants={participants}
                  onlineUserIds={onlineUserIds}
                />
              </div>
            </ScrollArea>
          )}
          {showParticipants && (
            <div className='border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground'>
              {
                Object.values(participants).filter(
                  participant =>
                    participant.online || onlineUserIds.has(participant.id)
                ).length
              }{' '}
              online in room
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
