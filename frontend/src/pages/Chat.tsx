import { useQueryClient } from '@tanstack/react-query'
import {
    Hash,
    MessageCircle,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Send,
    Users,
    X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation, Message, User } from '@/api/types'
import { MessageList } from '@/components/chat/MessageList'
import { ParticipantsList } from '@/components/chat/ParticipantsList'
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
    useMessages,
    useSendMessage,
} from '@/hooks/useChat'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'
import {
    deduplicateDMConversations,
    getDirectMessageAvatar,
    getDirectMessageName,
    getInitials,
} from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

export default function Chat() {
    const { id: urlChatId } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [newMessage, setNewMessage] = useState('')
    const [showChatrooms, setShowChatrooms] = useState(true)
    const [leftSidebarMode, setLeftSidebarMode] = useState<'rooms' | 'dms'>('rooms')
    const [showParticipants, setShowParticipants] = useState(true)
    const [messageError, setMessageError] = useState<string | null>(null)
    const [openRoomTabs, setOpenRoomTabs] = useState<number[]>([])
    const [unreadByRoom, setUnreadByRoom] = useState<Record<number, number>>({})
    const [roomOnlineIds, setRoomOnlineIds] = useState<Record<number, Set<number>>>({})
    const roomAlertedRef = useRef<Set<number>>(new Set())
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const queryClient = useQueryClient()

    const onlineUserIds = usePresenceStore((state) => state.onlineUserIds)
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)

    const currentUser = useMemo(() => getCurrentUser(), [])

    const { data: allChatrooms = [], isLoading: allLoading, error: allError } = useAllChatrooms()
    const { data: allConversations = [], isLoading: conversationsLoading } = useConversations()
    const { data: joinedChatrooms = [] } = useJoinedChatrooms()
    const joinChatroom = useJoinChatroom()
    const leaveConversation = useLeaveConversation()

    const conversations = allChatrooms as Conversation[]
    const activeRooms = useMemo(() => joinedChatrooms as Conversation[], [joinedChatrooms])
    const dmConversations = useMemo(
        () => deduplicateDMConversations(allConversations as Conversation[], currentUser?.id),
        [allConversations, currentUser?.id]
    )

    const selectedChatId = useMemo(
        () => (urlChatId ? Number.parseInt(urlChatId, 10) : null),
        [urlChatId]
    )

    const selectedListedConversation = useMemo(() => {
        if (!selectedChatId) return null
        return (
            conversations.find((c) => c.id === selectedChatId) ||
            dmConversations.find((c) => c.id === selectedChatId) ||
            activeRooms.find((c) => c.id === selectedChatId) ||
            null
        )
    }, [conversations, dmConversations, activeRooms, selectedChatId])

    const canAccessSelectedConversation = useMemo(() => {
        if (!selectedListedConversation) return false
        if (!selectedListedConversation.is_group) return true
        if (
            typeof (selectedListedConversation as { is_joined?: boolean }).is_joined === 'boolean'
        ) {
            return Boolean((selectedListedConversation as { is_joined?: boolean }).is_joined)
        }
        return activeRooms.some((joined) => joined.id === selectedListedConversation.id)
    }, [selectedListedConversation, activeRooms])

    const { data: selectedConversation } = useConversation(selectedChatId || 0, {
        enabled: canAccessSelectedConversation,
    })

    useEffect(() => {
        if (selectedChatId) return
        if (leftSidebarMode === 'dms' && dmConversations.length > 0) {
            navigate(`/chat/${dmConversations[0].id}`, { replace: true })
            return
        }
        if (activeRooms.length > 0) {
            navigate(`/chat/${activeRooms[0].id}`, { replace: true })
        }
    }, [activeRooms, dmConversations, leftSidebarMode, selectedChatId, navigate])

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

    const { data: messages = [], isLoading } = useMessages(selectedChatId || 0, undefined, {
        enabled: canAccessSelectedConversation,
    })
    const sendMessage = useSendMessage(selectedChatId || 0)

    const fallbackConversation = useMemo(() => {
        if (!selectedChatId) return null
        return (
            conversations.find((c) => c.id === selectedChatId) ||
            dmConversations.find((c) => c.id === selectedChatId) ||
            activeRooms.find((c) => c.id === selectedChatId) ||
            null
        )
    }, [conversations, dmConversations, activeRooms, selectedChatId])

    const currentConversation = useMemo(
        () => selectedConversation || fallbackConversation,
        [selectedConversation, fallbackConversation]
    )
    const isCurrentConversationGroup = currentConversation?.is_group === true

    const isJoinedViaList = useMemo(
        () => joinedChatrooms.some((c) => c.id === selectedChatId),
        [joinedChatrooms, selectedChatId]
    )

    const userIsJoined = useMemo(() => {
        if (!currentConversation) return false
        if (!currentConversation.is_group) return true
        const fromChatrooms = (currentConversation as Conversation & { is_joined?: boolean })
            .is_joined
        if (typeof fromChatrooms === 'boolean') return fromChatrooms
        if (!currentUser) return isJoinedViaList
        return (
            currentConversation.participants?.some((p) => p.id === currentUser.id) ||
            isJoinedViaList ||
            false
        )
    }, [currentConversation, currentUser, isJoinedViaList])

    const isRoomJoined = useCallback(
        (room: Conversation & { is_joined?: boolean }) => {
            if (typeof room.is_joined === 'boolean') {
                return room.is_joined
            }
            return activeRooms.some((joined) => joined.id === room.id)
        },
        [activeRooms]
    )

    const [participants, setParticipants] = useState<
        Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
    >({})
    const setRoomParticipantsInCache = useCallback(
        (conversationId: number, nextParticipants: User[]) => {
            queryClient.setQueryData<Conversation[] | undefined>(
                ['chat', 'chatrooms', 'all'],
                (oldRooms) =>
                    oldRooms?.map((room) =>
                        room.id === conversationId
                            ? {
                                  ...room,
                                  participants: nextParticipants,
                              }
                            : room
                    )
            )
            queryClient.setQueryData<Conversation[] | undefined>(
                ['chat', 'chatrooms', 'joined'],
                (oldRooms) =>
                    oldRooms?.map((room) =>
                        room.id === conversationId
                            ? {
                                  ...room,
                                  participants: nextParticipants,
                              }
                            : room
                    )
            )
            queryClient.setQueryData<Conversation | undefined>(
                ['chat', 'conversation', conversationId],
                (oldConversation) =>
                    oldConversation
                        ? {
                              ...oldConversation,
                              participants: nextParticipants,
                          }
                        : oldConversation
            )
        },
        [queryClient]
    )

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages.length])

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
            !!currentUser && (userIsJoined || usersList.some((u) => u.id === currentUser.id))

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
    }, [selectedChatId, currentConversation, currentUser, userIsJoined, onlineUserIds])

    const { playDirectMessageSound, playRoomAlertSound } = useAudio()

    const onMessage = useCallback(
        (msg: Message) => {
            if (isCurrentConversationGroup) return
            if (msg.sender_id === currentUser?.id) return
            playDirectMessageSound()
        },
        [isCurrentConversationGroup, currentUser?.id, playDirectMessageSound]
    )

    const onPresence = useCallback(
        (userId: number, username: string, status: string) => {
            const online = status === 'online' || status === 'connected'
            setParticipants((prev) => ({
                ...prev,
                [userId]: { ...(prev?.[userId] || { id: userId, username }), online },
            }))
            if (online) setOnline(userId)
            else setOffline(userId)
        },
        [setOnline, setOffline]
    )

    const onConnectedUsers = useCallback(
        (userIds: number[]) => {
            setInitialOnlineUsers(userIds)
        },
        [setInitialOnlineUsers]
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
                (oldMessages) => {
                    if (!oldMessages) return [roomMessage]
                    if (oldMessages.some((m) => m.id === roomMessage.id)) return oldMessages
                    return [...oldMessages, roomMessage]
                }
            )

            queryClient.setQueryData<Conversation[] | undefined>(
                ['chat', 'chatrooms', 'all'],
                (oldRooms) =>
                    oldRooms?.map((room) =>
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
                (oldRooms) =>
                    oldRooms?.map((room) =>
                        room.id === conversationId
                            ? {
                                  ...room,
                                  last_message: roomMessage,
                              }
                            : room
                    )
            )

            if (conversationId === selectedChatId) {
                setUnreadByRoom((prev) =>
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

            const isJoinedRoom = activeRooms.some((room) => room.id === conversationId)
            if (!isJoinedRoom) {
                return
            }

            if (!roomAlertedRef.current.has(conversationId)) {
                roomAlertedRef.current.add(conversationId)
                playRoomAlertSound()
            }

            setUnreadByRoom((prev) => ({
                ...prev,
                [conversationId]: (prev[conversationId] || 0) + 1,
            }))
        },
        [queryClient, selectedChatId, currentUser?.id, playRoomAlertSound, activeRooms]
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

            setRoomParticipantsInCache(payload.conversation_id, payload.participants || [])

            // Sync per-room online tracking from authoritative backend data
            if (Array.isArray(payload.online_user_ids)) {
                const onlineSet = new Set(payload.online_user_ids)
                setRoomOnlineIds((prev) => ({
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
        [onParticipantsUpdate, selectedChatId, setRoomParticipantsInCache, setOnline, setOffline]
    )

    const { isJoined: wsIsJoined } = useChatWebSocket({
        conversationId: canAccessSelectedConversation ? (selectedChatId ?? 0) : 0,
        enabled: true,
        autoJoinConversation: canAccessSelectedConversation && !!selectedChatId && userIsJoined,
        joinedRoomIds: openRoomTabs,
        onMessage,
        onRoomMessage,
        onPresence,
        onConnectedUsers,
        onParticipantsUpdate,
        onChatroomPresence,
    })

    useEffect(() => {
        if (!selectedChatId) return
        if (!isCurrentConversationGroup) return

        setOpenRoomTabs((prev) =>
            prev.includes(selectedChatId) ? prev : [...prev, selectedChatId]
        )
        roomAlertedRef.current.delete(selectedChatId)
        setUnreadByRoom((prev) =>
            prev[selectedChatId]
                ? {
                      ...prev,
                      [selectedChatId]: 0,
                  }
                : prev
        )
    }, [selectedChatId, isCurrentConversationGroup])

    useEffect(() => {
        setOpenRoomTabs((prev) => {
            const next = prev.filter((roomId) => activeRooms.some((room) => room.id === roomId))
            return next.length === prev.length ? prev : next
        })
    }, [activeRooms])

    const handleSendMessage = useCallback(() => {
        if (!newMessage.trim() || !selectedChatId || !currentUser) return
        const tempId = crypto.randomUUID()
        const messageContent = newMessage

        setNewMessage('')
        sendMessage.mutate(
            { content: messageContent, message_type: 'text', metadata: { tempId } },
            {
                onError: (error) => {
                    console.error('Failed to send message:', error)
                    setMessageError('Failed to send message')
                },
            }
        )
    }, [newMessage, selectedChatId, currentUser, sendMessage])

    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
            }
        },
        [handleSendMessage]
    )

    const handleJoinConversation = useCallback(
        (id: number) => {
            joinChatroom.mutate(id, {
                onSuccess: () => {
                    setLeftSidebarMode('rooms')
                    setOpenRoomTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
                    navigate(`/chat/${id}`)
                },
            })
        },
        [joinChatroom, navigate]
    )

    const handleSelectConversation = useCallback(
        (id: number) => {
            const conv = (conversations.find((c) => c.id === id) ||
                activeRooms.find((c) => c.id === id)) as
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
                setOpenRoomTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
                setUnreadByRoom((prev) =>
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

    const handleCloseRoomTab = useCallback(
        (roomId: number) => {
            let nextSelectedRoomId: number | null = null
            setOpenRoomTabs((prev) => {
                const remaining = prev.filter((id) => id !== roomId)
                if (selectedChatId === roomId) {
                    nextSelectedRoomId =
                        remaining[remaining.length - 1] ||
                        activeRooms.find((room) => room.id !== roomId)?.id ||
                        null
                }
                return remaining
            })

            setUnreadByRoom((prev) => {
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
        (conversation: Conversation) => getDirectMessageName(conversation, currentUser?.id),
        [currentUser?.id]
    )

    const getDmAvatar = useCallback(
        (conversation: Conversation) => getDirectMessageAvatar(conversation, currentUser?.id),
        [currentUser?.id]
    )

    const selectedDirectOtherUser =
        currentConversation && !isCurrentConversationGroup
            ? currentConversation.participants?.find(
                  (participant) => participant.id !== currentUser?.id
              )
            : null
    const isSelectedDirectOtherUserOnline = selectedDirectOtherUser
        ? onlineUserIds.has(selectedDirectOtherUser.id)
        : false
    const selectedRoomOnlineCount = useMemo(
        () =>
            Object.values(participants).filter(
                (participant) => participant.online || onlineUserIds.has(participant.id)
            ).length,
        [participants, onlineUserIds]
    )
    const getRoomOnlineCount = useCallback(
        (room: Conversation) => {
            // Use per-room online IDs from chatroom_presence events (authoritative)
            const roomOnline = roomOnlineIds[room.id]
            if (roomOnline) return roomOnline.size

            // Fallback to global presence store
            const roomParticipants = room.participants || []
            if (roomParticipants.length === 0) return 0
            return roomParticipants.filter((participant) => {
                if (room.id === selectedChatId && participants[participant.id]) {
                    return participants[participant.id].online || onlineUserIds.has(participant.id)
                }
                return onlineUserIds.has(participant.id)
            }).length
        },
        [roomOnlineIds, onlineUserIds, participants, selectedChatId]
    )

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {allError && (
                <div className="border-b border-destructive bg-destructive/15 p-3">
                    <p className="text-sm text-destructive">
                        Error loading chatrooms: {String(allError)}
                    </p>
                </div>
            )}

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside
                    className={cn(
                        'hidden shrink-0 overflow-hidden bg-card/40 transition-all duration-200 md:flex md:flex-col',
                        showChatrooms ? 'w-72 border-r border-border/70' : 'w-0 border-r-0'
                    )}
                >
                    <div className="flex h-12 items-center border-b border-border/70 px-2">
                        <button
                            type="button"
                            onClick={() => setShowChatrooms(false)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                            aria-label="Collapse sidebar"
                        >
                            <PanelLeftClose className="h-4 w-4" />
                        </button>
                        <h2 className="ml-2 flex items-center gap-2 text-sm font-semibold">
                            {leftSidebarMode === 'rooms' ? (
                                <Hash className="h-4 w-4 text-primary" />
                            ) : (
                                <MessageCircle className="h-4 w-4 text-primary" />
                            )}
                            {leftSidebarMode === 'rooms' ? 'Chatrooms' : 'Direct Messages'}
                        </h2>
                    </div>

                    <div className="border-b border-border/70 p-2">
                        <div className="grid grid-cols-2 gap-1">
                            <button
                                type="button"
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
                                type="button"
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
                        <>
                            <div className="border-b border-border/70 px-3 py-2">
                                <p className="text-[11px] text-muted-foreground">
                                    {conversations.length} rooms
                                </p>
                            </div>

                            <ScrollArea className="min-h-0 flex-1">
                                <div className="grid grid-cols-2 gap-1.5 p-2">
                                    {allLoading ? (
                                        <div className="col-span-2 p-4 text-center text-xs text-muted-foreground">
                                            Loading chatrooms...
                                        </div>
                                    ) : conversations.length === 0 ? (
                                        <div className="col-span-2 p-4 text-center text-xs text-muted-foreground">
                                            No chatrooms available.
                                        </div>
                                    ) : (
                                        conversations.map((room) => {
                                            const joined = isRoomJoined(room)
                                            const selected = selectedChatId === room.id

                                            return (
                                                <button
                                                    key={room.id}
                                                    type="button"
                                                    onClick={() =>
                                                        handleSelectConversation(room.id)
                                                    }
                                                    className={cn(
                                                        'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                                                        selected
                                                            ? 'border-primary/30 bg-primary/10'
                                                            : 'border-transparent hover:border-border/60 hover:bg-muted/60'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="truncate text-[13px] font-semibold text-foreground">
                                                            {room.name || `Room ${room.id}`}
                                                        </p>
                                                        {!joined && (
                                                            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                                Join
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                        {room.participants?.length || 0} members
                                                        {getRoomOnlineCount(room) > 0 && (
                                                            <span className="text-emerald-500">
                                                                {' '}
                                                                · {getRoomOnlineCount(room)} online
                                                            </span>
                                                        )}
                                                    </p>
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                        </>
                    ) : (
                        <>
                            <div className="border-b border-border/70 px-3 py-2">
                                <p className="text-[11px] text-muted-foreground">
                                    {dmConversations.length} conversations
                                </p>
                            </div>
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="space-y-1.5 p-2">
                                    {conversationsLoading ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            Loading conversations...
                                        </div>
                                    ) : dmConversations.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                            No direct conversations yet.
                                        </div>
                                    ) : (
                                        dmConversations.map((conversation) => {
                                            const otherUser = conversation.participants?.find(
                                                (p) => p.id !== currentUser?.id
                                            )
                                            const isOnline = otherUser
                                                ? onlineUserIds.has(otherUser.id)
                                                : false
                                            const isSelected = selectedChatId === conversation.id
                                            return (
                                                <button
                                                    key={`dm-${conversation.id}`}
                                                    type="button"
                                                    onClick={() =>
                                                        handleSelectDirectMessage(conversation.id)
                                                    }
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                                                        isSelected
                                                            ? 'border-primary/30 bg-primary/10'
                                                            : 'border-transparent hover:border-border/60 hover:bg-muted/60'
                                                    )}
                                                >
                                                    <Avatar className="h-8 w-8 border">
                                                        <AvatarImage
                                                            src={getDmAvatar(conversation)}
                                                        />
                                                        <AvatarFallback className="text-[10px]">
                                                            {getInitials(getDmName(conversation))}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="truncate text-[12px] font-semibold">
                                                                {getDmName(conversation)}
                                                            </p>
                                                            <span
                                                                className={cn(
                                                                    'h-2 w-2 shrink-0 rounded-full',
                                                                    isOnline
                                                                        ? 'bg-emerald-500'
                                                                        : 'bg-gray-400'
                                                                )}
                                                            />
                                                        </div>
                                                        {conversation.last_message && (
                                                            <p className="truncate text-[11px] text-muted-foreground">
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

                <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex h-12 items-center justify-between border-b border-border/70 bg-card/35 px-3">
                        <div className="flex min-w-0 items-center gap-2">
                            {!showChatrooms && (
                                <button
                                    type="button"
                                    onClick={() => setShowChatrooms(true)}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                                    aria-label="Expand sidebar"
                                >
                                    <PanelLeftOpen className="h-4 w-4" />
                                </button>
                            )}
                            {currentConversation ? (
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-foreground">
                                        {isCurrentConversationGroup
                                            ? currentConversation.name ||
                                              `Room ${currentConversation.id}`
                                            : getDmName(currentConversation)}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        {isCurrentConversationGroup
                                            ? `${selectedRoomOnlineCount} online`
                                            : isSelectedDirectOtherUserOnline
                                              ? 'Online'
                                              : 'Offline'}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm font-medium text-muted-foreground">
                                    {leftSidebarMode === 'rooms'
                                        ? 'Select a chatroom'
                                        : 'Select a direct message'}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5" />
                    </div>
                    {openRoomTabs.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 bg-card/20 px-3 py-2">
                            {openRoomTabs.map((roomId) => {
                                const room =
                                    conversations.find((c) => c.id === roomId) ||
                                    activeRooms.find((c) => c.id === roomId)
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
                                                : 'border-border/70 bg-card hover:bg-muted/60',
                                            unread > 0 &&
                                                !selected &&
                                                'border-primary/50 shadow-[0_0_16px_rgba(59,130,246,0.35)] animate-pulse'
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSelectConversation(roomId)}
                                            className="inline-flex items-center gap-2 px-3 py-1.5"
                                        >
                                            <Hash className="h-3 w-3" />
                                            <span className="max-w-28 truncate">
                                                {room.name || `Room ${room.id}`}
                                            </span>
                                            {unread > 0 && (
                                                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                                                    {unread}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Close room tab ${room.name || room.id}`}
                                            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                            onClick={(event) => {
                                                event.preventDefault()
                                                event.stopPropagation()
                                                handleCloseRoomTab(roomId)
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <ScrollArea className="min-h-0 flex-1">
                        <div className="mx-auto w-full max-w-3xl p-4">
                            <MessageList
                                messages={messages}
                                isLoading={isLoading}
                                currentUserId={currentUser?.id}
                            />
                            <div ref={messagesEndRef} className="h-2" />
                        </div>
                    </ScrollArea>

                    <div className="border-t border-border/70 bg-card/25 p-3">
                        <div className="mx-auto w-full max-w-3xl">
                            {messageError && (
                                <p className="mb-2 px-1 text-xs font-medium text-destructive">
                                    {messageError}
                                </p>
                            )}

                            {userIsJoined ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder={
                                            wsIsJoined ? 'Type a message...' : 'Connecting...'
                                        }
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={handleKeyPress}
                                        disabled={!wsIsJoined}
                                        className="h-10 flex-1 rounded-full border-border/60 bg-card"
                                    />
                                    <Button
                                        onClick={handleSendMessage}
                                        disabled={!newMessage.trim() || !wsIsJoined}
                                        className="h-10 w-10 rounded-full p-0"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">
                                        Join this room to send messages.
                                    </p>
                                    <Button
                                        onClick={() =>
                                            selectedChatId && handleJoinConversation(selectedChatId)
                                        }
                                        disabled={joinChatroom.isPending}
                                        size="sm"
                                        className="rounded-lg"
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
                        showParticipants ? 'w-60' : 'w-12'
                    )}
                >
                    <div className="flex h-12 items-center border-b border-border/70 px-2">
                        {showParticipants && (
                            <h2 className="ml-1 flex items-center gap-2 text-sm font-semibold">
                                <Users className="h-4 w-4" />
                                Members
                            </h2>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowParticipants((prev) => !prev)}
                            className={cn(
                                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
                                showParticipants ? 'ml-auto' : 'mx-auto'
                            )}
                            aria-label={
                                showParticipants ? 'Collapse members panel' : 'Expand members panel'
                            }
                        >
                            {showParticipants ? (
                                <PanelRightClose className="h-4 w-4" />
                            ) : (
                                <PanelRightOpen className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                    {showParticipants && (
                        <ScrollArea className="min-h-0 flex-1">
                            <div className="p-2">
                                <ParticipantsList
                                    participants={participants}
                                    onlineUserIds={onlineUserIds}
                                />
                            </div>
                        </ScrollArea>
                    )}
                    {showParticipants && (
                        <div className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                            {
                                Object.values(participants).filter(
                                    (participant) =>
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
