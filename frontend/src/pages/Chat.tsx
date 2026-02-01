import { ChevronLeft, ChevronRight, Compass, Send, UserCircle, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation, Message, User } from '@/api/types'
import { MessageList } from '@/components/chat/MessageList'
import { ParticipantsList } from '@/components/chat/ParticipantsList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    useAllChatrooms,
    useJoinChatroom,
    useJoinedChatrooms,
    useMessages,
    useSendMessage,
} from '@/hooks/useChat'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'

export default function Chat() {
    const { id: urlChatId } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [newMessage, setNewMessage] = useState('')
    const [page, setPage] = useState(1)
    const ITEMS_PER_PAGE = 5
    const [showParticipants, setShowParticipants] = useState(true)
    const [messageError, setMessageError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const onlineUserIds = usePresenceStore((state) => state.onlineUserIds)
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)

    const currentUser = useMemo(() => getCurrentUser(), [])

    // Chatroom queries
    const { data: allChatrooms = [], isLoading: allLoading, error: allError } = useAllChatrooms()
    const {
        data: joinedChatrooms = [],
        isLoading: _joinedLoading,
        error: _joinedError,
    } = useJoinedChatrooms()
    const joinChatroom = useJoinChatroom()

    const conversations = allChatrooms as Conversation[]
    const convLoading = allLoading
    const convError = allError

    const paginatedConversations = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return conversations.slice(start, start + ITEMS_PER_PAGE)
    }, [conversations, page])

    const totalPages = Math.ceil(conversations.length / ITEMS_PER_PAGE)

    const activeRooms = useMemo(() => {
        return joinedChatrooms as Conversation[]
    }, [joinedChatrooms])

    const selectedChatId = useMemo(
        () => (urlChatId ? Number.parseInt(urlChatId, 10) : null),
        [urlChatId]
    )

    // Auto-select first conversation when loaded if none in URL
    useEffect(() => {
        if (activeRooms && activeRooms.length > 0 && !selectedChatId) {
            navigate(`/chat/${activeRooms[0].id}`, { replace: true })
        } else if (conversations && conversations.length > 0 && !selectedChatId) {
            // If no active rooms, don't auto-select yet, let user pick
        }
    }, [activeRooms, conversations, selectedChatId, navigate])

    const { data: messages = [], isLoading } = useMessages(selectedChatId || 0)
    const sendMessage = useSendMessage(selectedChatId || 0)

    const currentConversation = useMemo(
        () => conversations?.find((c) => c.id === selectedChatId),
        [conversations, selectedChatId]
    )

    const isJoinedViaList = useMemo(
        () => joinedChatrooms?.some((c) => c.id === selectedChatId),
        [joinedChatrooms, selectedChatId]
    )

    const userIsJoined = useMemo(
        () => currentConversation?.is_joined || isJoinedViaList || false,
        [currentConversation, isJoinedViaList]
    )

    const [participants, setParticipants] = useState<
        Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
    >({})

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages.length])

    useEffect(() => {
        if (!currentConversation) return
        const usersList: User[] = currentConversation.participants || []
        const map: Record<
            number,
            { id: number; username?: string; online?: boolean; typing?: boolean }
        > = {}

        if (currentUser) {
            map[currentUser.id] = {
                id: currentUser.id,
                username: currentUser.username,
                online: true,
                typing: false,
            }
        }

        if (usersList && usersList.length > 0) {
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
        }

        setParticipants(map)
    }, [currentConversation, currentUser, onlineUserIds])

    const onMessage = useCallback((_msg: Message) => {}, [])

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
            if (currentUser) {
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
        [currentUser, onlineUserIds]
    )

    const { isJoined: wsIsJoined } = useChatWebSocket({
        conversationId: selectedChatId || 0,
        enabled: !!selectedChatId && userIsJoined,
        onMessage,
        onPresence,
        onConnectedUsers,
        onParticipantsUpdate,
    })

    const handleSendMessage = useCallback(() => {
        if (!newMessage.trim() || !selectedChatId || !currentUser) return
        const tempId = crypto.randomUUID()
        const messageContent = newMessage

        setNewMessage('')
        sendMessage.mutate(
            { content: messageContent, message_type: 'text', metadata: { tempId } },
            {
                onSuccess: () => {
                    // Hook handles everything
                },
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

    const handleInputChange = useCallback((val: string) => {
        setNewMessage(val)
    }, [])

    const handleJoinConversation = useCallback(
        (id: number) => {
            joinChatroom.mutate(id, {
                onSuccess: () => {
                    navigate(`/chat/${id}`)
                },
            })
        },
        [joinChatroom, navigate]
    )

    const handleSelectConversation = useCallback(
        (id: number) => {
            const conv = conversations.find((c) => c.id === id)
            if (conv && !conv.is_joined) {
                handleJoinConversation(id)
            } else {
                navigate(`/chat/${id}`)
            }
        },
        [conversations, navigate, handleJoinConversation]
    )

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {convError && (
                <div className="bg-destructive/15 border-b border-destructive p-4">
                    <p className="text-sm text-destructive">
                        Error loading chatrooms: {String(convError)}
                    </p>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <div className="w-[240px] border-r bg-card flex flex-col overflow-hidden shrink-0">
                    <div className="p-4 border-b shrink-0 h-[60px] flex items-center justify-between bg-muted/20">
                        <h2 className="font-bold text-xs flex items-center gap-2 uppercase tracking-tighter">
                            <Compass className="w-4 h-4 text-primary" />
                            Discover Rooms
                        </h2>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="p-3 space-y-2 flex-1">
                            {convLoading ? (
                                <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
                                    Scanning frequencies...
                                </div>
                            ) : paginatedConversations.length > 0 ? (
                                paginatedConversations.map((conv) => (
                                    <button
                                        key={conv.id}
                                        type="button"
                                        onClick={() => handleSelectConversation(conv.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left border border-transparent',
                                            selectedChatId === conv.id
                                                ? 'bg-primary/10 border-primary/20 text-foreground'
                                                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground hover:border-muted'
                                        )}
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-primary/20 to-primary/5 flex items-center justify-center font-black text-primary shrink-0 border border-primary/10 shadow-sm">
                                            {conv.name?.[0].toUpperCase() || 'C'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-sm font-bold truncate leading-none">
                                                    {conv.name || `Room ${conv.id}`}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-black uppercase opacity-50 truncate leading-none tracking-tight">
                                                {conv.participants?.length || 0} members
                                            </p>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="py-20 text-center text-xs text-muted-foreground italic">
                                    Silence in the void.
                                </div>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        <div className="p-3 border-t bg-muted/5 flex items-center justify-between gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="h-8 w-8 rounded-lg"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-[10px] font-black uppercase tracking-tighter opacity-50">
                                Page {page} / {totalPages || 1}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="h-8 w-8 rounded-lg"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Center - Message Window */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                    {/* Active Rooms Bar */}
                    <div className="h-14 border-b bg-card/50 flex items-center px-4 gap-2 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2 pr-4 border-r mr-2 h-8">
                            <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground whitespace-nowrap">
                                Active Rooms
                            </span>
                        </div>
                        {activeRooms.map((room) => (
                            <button
                                key={room.id}
                                type="button"
                                onClick={() => navigate(`/chat/${room.id}`)}
                                className={cn(
                                    'group flex items-center gap-2 px-3 py-1.5 rounded-full transition-all shrink-0 border',
                                    selectedChatId === room.id
                                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-primary'
                                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-transparent'
                                )}
                            >
                                <div
                                    className={cn(
                                        'w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ring-1',
                                        selectedChatId === room.id
                                            ? 'bg-white/20 ring-white/30'
                                            : 'bg-primary/10 text-primary ring-primary/20'
                                    )}
                                >
                                    {room.name?.[0].toUpperCase() || 'C'}
                                </div>
                                <span className="text-xs font-bold whitespace-nowrap truncate max-w-[100px]">
                                    {room.name || `Room ${room.id}`}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="border-b px-6 h-[60px] flex items-center justify-between shrink-0 bg-card/30 backdrop-blur-sm">
                        <div className="flex items-center gap-3 shrink-0">
                            {currentConversation && (
                                <>
                                    <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-black text-xs shadow-md ring-1 ring-primary/20">
                                        {currentConversation.name?.[0].toUpperCase() || 'C'}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm leading-none mb-1">
                                            {currentConversation.name ||
                                                `Room ${currentConversation.id}`}
                                        </h3>
                                        <p className="text-[10px] text-primary font-black uppercase tracking-tighter leading-none flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            {currentConversation.participants?.length || 0} Members
                                            Active
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowParticipants(!showParticipants)}
                                className={cn(
                                    'flex items-center gap-2 rounded-xl px-4 border transition-all h-9',
                                    showParticipants
                                        ? 'bg-primary/10 text-primary border-primary/20'
                                        : 'text-muted-foreground hover:bg-muted border-transparent'
                                )}
                            >
                                <Users className="w-4 h-4" />
                                <span className="text-xs font-black uppercase tracking-tighter">
                                    {showParticipants ? 'Hide' : 'Show'} Members
                                </span>
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="max-w-3xl mx-auto w-full p-6">
                            <MessageList
                                messages={messages}
                                isLoading={isLoading}
                                currentUserId={currentUser?.id}
                            />
                            <div ref={messagesEndRef} className="h-4" />
                        </div>
                    </ScrollArea>

                    <div className="p-4 border-t bg-card/10">
                        <div className="max-w-3xl mx-auto">
                            {messageError && (
                                <p className="text-xs text-destructive mb-2 font-medium px-4">
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
                                        onChange={(e) => handleInputChange(e.target.value)}
                                        onKeyDown={handleKeyPress}
                                        disabled={!wsIsJoined}
                                        className="flex-1 rounded-full bg-card border-none px-6 h-11 shadow-inner"
                                    />
                                    <Button
                                        onClick={handleSendMessage}
                                        disabled={!newMessage.trim() || !wsIsJoined}
                                        className="rounded-full w-11 h-11 p-0 shadow-lg"
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-8 gap-4 bg-muted/30 rounded-3xl border border-dashed">
                                    <p className="text-muted-foreground text-sm font-medium">
                                        Join this room to participate in the conversation.
                                    </p>
                                    <Button
                                        onClick={() =>
                                            selectedChatId && handleJoinConversation(selectedChatId)
                                        }
                                        disabled={joinChatroom.isPending}
                                        className="rounded-full px-8 shadow-md"
                                    >
                                        {joinChatroom.isPending ? 'Joining...' : 'Join Chatroom'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Sidebar - Active Users */}
                <div
                    className={cn(
                        'border-l bg-card flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
                        showParticipants ? 'w-[250px] opacity-100' : 'w-0 opacity-0 border-none'
                    )}
                >
                    <div className="p-4 border-b shrink-0 h-[60px] flex items-center">
                        <h2 className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap">
                            <Users className="w-4 h-4" />
                            Online Members
                        </h2>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2">
                            <ParticipantsList
                                participants={participants}
                                onlineUserIds={onlineUserIds}
                            />
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    )
}
