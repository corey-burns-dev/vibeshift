import { Compass, Send, UserCircle, Users } from 'lucide-react'
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
    const [chatroomTab, setChatroomTab] = useState<'all' | 'joined'>('joined')
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
        isLoading: joinedLoading,
        error: joinedError,
    } = useJoinedChatrooms()
    const joinChatroom = useJoinChatroom()

    // Use the appropriate list based on active tab
    const conversations = useMemo(
        () =>
            chatroomTab === 'all'
                ? (allChatrooms as Conversation[])
                : (joinedChatrooms as Conversation[]),
        [chatroomTab, allChatrooms, joinedChatrooms]
    )

    const convLoading = chatroomTab === 'all' ? allLoading : joinedLoading
    const convError = chatroomTab === 'all' ? allError : joinedError

    const selectedChatId = useMemo(
        () => (urlChatId ? Number.parseInt(urlChatId) : null),
        [urlChatId]
    )

    // Auto-select first conversation when loaded if none in URL
    useEffect(() => {
        if (conversations && conversations.length > 0 && !selectedChatId) {
            const joined = conversations.find((c) => c.is_joined)
            if (joined) {
                navigate(`/chat/${joined.id}`, { replace: true })
            } else if (chatroomTab === 'joined') {
                navigate(`/chat/${conversations[0].id}`, { replace: true })
            }
        }
    }, [conversations, selectedChatId, navigate, chatroomTab])

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

    const handleSelectConversation = useCallback(
        (id: number) => {
            navigate(`/chat/${id}`)
        },
        [navigate]
    )

    const handleJoinConversation = useCallback(
        (id: number) => {
            joinChatroom.mutate(id)
        },
        [joinChatroom]
    )

    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden">
            {convError && (
                <div className="bg-destructive/15 border-b border-destructive p-4">
                    <p className="text-sm text-destructive">
                        Error loading chatrooms: {String(convError)}
                    </p>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Chatrooms (200px) */}
                <div className="w-[200px] border-r bg-card flex flex-col overflow-hidden shrink-0">
                    <div className="p-4 border-b shrink-0 h-[60px] flex items-center justify-between">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <Compass className="w-4 h-4" />
                            Chatrooms
                        </h2>
                        <div className="flex bg-muted p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setChatroomTab('joined')}
                                className={cn(
                                    'px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all',
                                    chatroomTab === 'joined'
                                        ? 'bg-background shadow-sm text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Joined
                            </button>
                            <button
                                type="button"
                                onClick={() => setChatroomTab('all')}
                                className={cn(
                                    'px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all',
                                    chatroomTab === 'all'
                                        ? 'bg-background shadow-sm text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                All
                            </button>
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {convLoading ? (
                                <div className="py-20 text-center text-xs text-muted-foreground">
                                    Loading...
                                </div>
                            ) : conversations.length > 0 ? (
                                conversations.map((conv) => (
                                    <button
                                        key={conv.id}
                                        type="button"
                                        onClick={() => handleSelectConversation(conv.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left',
                                            selectedChatId === conv.id
                                                ? 'bg-secondary text-foreground shadow-sm'
                                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-linear-to-tr from-primary/20 to-primary/5 flex items-center justify-center font-bold text-primary shrink-0 border">
                                            {conv.name?.[0].toUpperCase() || 'C'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-sm font-semibold truncate leading-none">
                                                    {conv.name || `Room ${conv.id}`}
                                                </span>
                                                {conv.is_joined && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                )}
                                            </div>
                                            <p className="text-xs opacity-70 truncate leading-none">
                                                {conv.participants?.length || 0} members
                                            </p>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="py-20 text-center text-xs text-muted-foreground italic">
                                    No rooms found.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Center - Message Window */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                    <div className="border-b px-6 h-[60px] flex items-center justify-between shrink-0 bg-card/30 backdrop-blur-sm">
                        <div className="flex items-center gap-3 shrink-0">
                            {currentConversation && (
                                <>
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20">
                                        {currentConversation.name?.[0].toUpperCase() || 'C'}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm leading-none mb-1">
                                            {currentConversation.name ||
                                                `Room ${currentConversation.id}`}
                                        </h3>
                                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-none">
                                            {currentConversation.participants?.length || 0} MEMBERS
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowParticipants(!showParticipants)}
                            className={cn(
                                'flex items-center gap-2 rounded-full px-4 border border-transparent transition-all',
                                showParticipants
                                    ? 'bg-primary/10 text-primary border-primary/20'
                                    : 'text-muted-foreground hover:bg-muted'
                            )}
                        >
                            <UserCircle className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">
                                {showParticipants ? 'Hide' : 'Show'} Members
                            </span>
                        </Button>
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
