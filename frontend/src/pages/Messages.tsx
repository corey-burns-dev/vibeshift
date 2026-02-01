import { useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation, Message, User } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConversations, useMessages, useSendMessage } from '@/hooks/useChat'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'

export default function Messages() {
    const { id: urlConvId } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [newMessage, setNewMessage] = useState('')
    const [messageTab, setMessageTab] = useState<'all' | 'unread'>('all')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<number | null>(null)

    const onlineUserIds = usePresenceStore((state) => state.onlineUserIds)
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)

    const currentUser = useMemo(() => getCurrentUser(), [])
    const {
        data: allConversations = [],
        isLoading: convLoading,
        error: convError,
    } = useConversations()

    // Filter and memoize conversations to avoid infinite loops
    const dmConversations = useMemo(
        () => allConversations.filter((c: Conversation) => !c.is_group),
        [allConversations]
    )

    const conversations = useMemo(
        () =>
            messageTab === 'unread'
                ? dmConversations.filter((c: Conversation) => (c.unread_count ?? 0) > 0)
                : dmConversations,
        [dmConversations, messageTab]
    )

    const selectedConversationId = useMemo(
        () => (urlConvId ? Number.parseInt(urlConvId, 10) : null),
        [urlConvId]
    )

    const selectedConversation = useMemo(
        () => conversations.find((c: Conversation) => c.id === selectedConversationId),
        [conversations, selectedConversationId]
    )

    // Auto-select first conversation if None is in URL
    useEffect(() => {
        if (conversations && conversations.length > 0 && !selectedConversationId) {
            navigate(`/messages/${conversations[0].id}`, { replace: true })
        }
    }, [conversations, selectedConversationId, navigate])

    const { data: messages = [], isLoading } = useMessages(selectedConversationId || 0)
    const sendMessage = useSendMessage(selectedConversationId || 0)
    const queryClient = useQueryClient()

    // Participants state
    const [participants, setParticipants] = useState<
        Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
    >({})

    // Scroll when messages arrive
    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    // Initialize participants from conversations data
    useEffect(() => {
        if (!selectedConversation) return
        const usersList: User[] = selectedConversation.participants || []
        if (usersList.length > 0) {
            const map: Record<
                number,
                { id: number; username?: string; online?: boolean; typing?: boolean }
            > = {}
            for (const u of usersList) {
                const uWithName = u as User & { name?: string; online?: boolean }
                map[u.id] = {
                    id: u.id,
                    username: u.username ?? uWithName.name,
                    online: !!uWithName.online,
                    typing: false,
                }
            }
            setParticipants(map)
        }
    }, [selectedConversation]) // Stable dependency

    // WebSocket for real-time updates
    const chatWs = useChatWebSocket({
        conversationId: selectedConversationId || 0,
        enabled: !!selectedConversationId,
        onMessage: (msg) => {
            if (selectedConversationId && msg.conversation_id === selectedConversationId) {
                queryClient.setQueryData<Message[]>(
                    ['chat', 'messages', selectedConversationId],
                    (old) => {
                        if (!old) return [msg]
                        if (Array.isArray(old)) {
                            if (old.some((m) => m.id === msg.id)) return old
                            return [...old, msg]
                        }
                        return old
                    }
                )
            }
        },
        onTyping: (userId, username, isTyping) => {
            setParticipants((prev) => ({
                ...(prev || {}),
                [userId]: {
                    ...(prev?.[userId] || { id: userId, username }),
                    typing: isTyping,
                    online: true,
                },
            }))
        },
        onPresence: (userId, username, status) => {
            const online = status === 'online' || status === 'connected'
            setParticipants((prev) => ({
                ...(prev || {}),
                [userId]: { ...(prev?.[userId] || { id: userId, username }), online },
            }))

            if (status === 'online') setOnline(userId)
            else setOffline(userId)
        },
        onConnectedUsers: (userIds) => {
            setInitialOnlineUsers(userIds)
        },
    })

    const handleSendMessage = () => {
        if (!newMessage.trim() || !selectedConversationId) return
        const tempId = Date.now().toString()
        sendMessage.mutate(
            { content: newMessage, message_type: 'text', metadata: { tempId } },
            {
                onSuccess: () => {
                    setNewMessage('')
                    try {
                        chatWs?.sendTyping(false)
                    } catch {}
                },
            }
        )
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const handleInputChange = (val: string) => {
        setNewMessage(val)
        try {
            chatWs?.sendTyping(true)
        } catch {}
        if (typingTimeoutRef.current) {
            window.clearTimeout(typingTimeoutRef.current)
        }
        typingTimeoutRef.current = window.setTimeout(() => {
            try {
                chatWs?.sendTyping(false)
            } catch {}
        }, 1500) as unknown as number
    }

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    // Get conversation display name (other person's name for DMs)
    const getConversationName = useCallback(
        (conv: Conversation) => {
            if (conv.name) return conv.name
            const otherUser = conv.participants?.find((p) => p.id !== currentUser?.id)
            return otherUser?.username || 'Unknown User'
        },
        [currentUser]
    )

    // Get avatar for conversation
    const getConversationAvatar = useCallback(
        (conv: Conversation) => {
            const otherUser = conv.participants?.find((p) => p.id !== currentUser?.id)
            return (
                otherUser?.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${getConversationName(conv)}`
            )
        },
        [currentUser, getConversationName]
    )

    return (
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
            {convError && (
                <div className="bg-destructive/15 border-b border-destructive p-4">
                    <p className="text-sm text-destructive">
                        Error loading messages: {String(convError)}
                    </p>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Conversations (250px fixed) */}
                <div className="w-[250px] border-r bg-card flex flex-col overflow-hidden">
                    <div className="p-4 border-b shrink-0 h-[60px] flex items-center">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <MessageCircle className="w-4 h-4" />
                            Direct Messages
                        </h2>
                    </div>

                    <div className="flex border-b shrink-0">
                        <button
                            type="button"
                            onClick={() => setMessageTab('all')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                messageTab === 'all'
                                    ? 'text-primary border-b-2 border-primary bg-accent/50'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            ALL
                        </button>
                        <button
                            type="button"
                            onClick={() => setMessageTab('unread')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                messageTab === 'unread'
                                    ? 'text-primary border-b-2 border-primary bg-accent/50'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            UNREAD
                        </button>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="space-y-1 p-2">
                            {convLoading ? (
                                <div className="text-xs text-muted-foreground text-center py-8">
                                    Loading...
                                </div>
                            ) : conversations.length > 0 ? (
                                conversations.map((conv: Conversation) => {
                                    const name = getConversationName(conv)
                                    const avatar = getConversationAvatar(conv)
                                    const otherUser = conv.participants?.find(
                                        (p) => p.id !== currentUser?.id
                                    )
                                    const isOnline = otherUser
                                        ? onlineUserIds.has(otherUser.id)
                                        : false
                                    const unread = conv.unread_count ?? 0

                                    return (
                                        <button
                                            key={conv.id}
                                            type="button"
                                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                                conv.id === selectedConversationId
                                                    ? 'bg-secondary text-foreground font-semibold'
                                                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                                            }`}
                                            onClick={() => navigate(`/messages/${conv.id}`)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative shrink-0">
                                                    <Avatar className="w-10 h-10 border">
                                                        <AvatarImage src={avatar} />
                                                        <AvatarFallback className="text-xs">
                                                            {name.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div
                                                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                                                            isOnline
                                                                ? 'bg-green-500'
                                                                : 'bg-gray-400'
                                                        }`}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium truncate text-sm">
                                                            {name}
                                                        </p>
                                                        {unread > 0 && (
                                                            <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                                                                {unread}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {conv.last_message && (
                                                        <p className="text-xs opacity-75 truncate">
                                                            {conv.last_message.content}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="text-xs text-muted-foreground text-center py-8">
                                    {messageTab === 'unread'
                                        ? 'No unread messages'
                                        : 'No conversations yet'}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Center - Chat Window */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                    <div className="border-b px-6 h-[60px] flex items-center justify-between shrink-0 bg-card/30 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            {selectedConversation && (
                                <>
                                    <Avatar className="w-8 h-8 border">
                                        <AvatarImage
                                            src={getConversationAvatar(selectedConversation)}
                                        />
                                        <AvatarFallback className="text-xs">
                                            {getConversationName(selectedConversation)
                                                .substring(0, 2)
                                                .toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h3 className="font-semibold text-sm">
                                            {getConversationName(selectedConversation)}
                                        </h3>
                                        <div className="flex items-center gap-1.5">
                                            <div
                                                className={`w-2 h-2 rounded-full ${participants[selectedConversation.participants?.find((p) => p.id !== currentUser?.id)?.id || 0]?.online ? 'bg-green-500' : 'bg-gray-400'}`}
                                            />
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                                                {participants[
                                                    selectedConversation.participants?.find(
                                                        (p) => p.id !== currentUser?.id
                                                    )?.id || 0
                                                ]?.online
                                                    ? 'Online'
                                                    : 'Offline'}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="max-w-3xl mx-auto w-full space-y-4 p-6">
                            {isLoading ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    Loading messages...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                                        <MessageCircle className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        No messages yet. Start the conversation!
                                    </p>
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const isOwnMessage = msg.sender_id === currentUser?.id
                                    const sender = msg.sender
                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex items-start gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                                        >
                                            <Avatar className="w-8 h-8 shrink-0 border">
                                                <AvatarImage
                                                    src={
                                                        sender?.avatar ||
                                                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${sender?.username}`
                                                    }
                                                />
                                                <AvatarFallback className="text-xs">
                                                    {sender?.username?.[0]?.toUpperCase() || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div
                                                className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    {!isOwnMessage && (
                                                        <span className="font-semibold text-xs">
                                                            {sender?.username}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {formatTimestamp(msg.created_at)}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`rounded-2xl px-4 py-2 text-sm ${
                                                        isOwnMessage
                                                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                                                            : 'bg-secondary text-foreground rounded-tl-none'
                                                    }`}
                                                >
                                                    {msg.content}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}

                            {Object.values(participants).some((p) => p.typing) && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                                    <div className="flex gap-1">
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" />
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
                                    </div>
                                    <span>
                                        {Object.values(participants)
                                            .filter((p) => p.typing)
                                            .map((p) => p.username)
                                            .join(', ')}{' '}
                                        is typing...
                                    </span>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    <div className="border-t p-4 shrink-0">
                        <div className="max-w-3xl mx-auto flex gap-2">
                            <Input
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyPress={handleKeyPress}
                                className="flex-1 rounded-full bg-secondary border-none px-4"
                            />
                            <Button
                                onClick={handleSendMessage}
                                disabled={!newMessage.trim()}
                                variant="default"
                                className="rounded-full w-10 h-10 p-0"
                            >
                                <Send className="w-4 h-4 text-primary-foreground" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar - Contact Info (200px fixed) */}
                <div className="w-[200px] border-l bg-card hidden lg:flex flex-col overflow-hidden">
                    <div className="p-4 border-b shrink-0 h-[60px] flex items-center">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Details
                        </h2>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-6">
                            {selectedConversation &&
                                (() => {
                                    const otherUser = selectedConversation.participants?.find(
                                        (p) => p.id !== currentUser?.id
                                    )
                                    const isOnline = otherUser
                                        ? onlineUserIds.has(otherUser.id)
                                        : false

                                    return (
                                        <div className="text-center">
                                            <Avatar className="w-20 h-20 mx-auto mb-4 border-2 p-0.5">
                                                <AvatarImage
                                                    src={getConversationAvatar(
                                                        selectedConversation
                                                    )}
                                                />
                                                <AvatarFallback>
                                                    {getConversationName(selectedConversation)
                                                        .substring(0, 2)
                                                        .toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <h3 className="font-bold text-lg mb-1">
                                                {getConversationName(selectedConversation)}
                                            </h3>
                                            <div className="flex items-center justify-center gap-1.5 border py-1 px-3 rounded-full w-fit mx-auto">
                                                <div
                                                    className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
                                                />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    {isOnline ? 'Active Now' : 'Offline'}
                                                </span>
                                            </div>

                                            <div className="mt-8 text-left space-y-4">
                                                <div>
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                                        About
                                                    </p>
                                                    <p className="text-xs">
                                                        {otherUser?.bio || 'No status set'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    )
}
