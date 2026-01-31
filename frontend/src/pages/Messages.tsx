import { useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Conversation, Message, User } from '@/api/types'
import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConversations, useMessages, useSendMessage } from '@/hooks/useChat'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'

export default function Messages() {
    const [newMessage, setNewMessage] = useState('')
    const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)
    const [messageTab, setMessageTab] = useState<'all' | 'unread'>('all')
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<number | null>(null)

    // Connect to presence WebSocket for real-time online status
    // Connect to presence WebSocket for real-time online status
    // usePresenceListener(); // CONFLICT: Removed to prevent double connection
    const onlineUserIds = usePresenceStore((state) => state.onlineUserIds)
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)

    const currentUser = getCurrentUser()
    const {
        data: allConversations = [],
        isLoading: convLoading,
        error: convError,
    } = useConversations()

    // Filter for DMs only (non-group conversations)
    const dmConversations = allConversations.filter((c: Conversation) => !c.is_group)

    // Apply tab filter
    const conversations =
        messageTab === 'unread'
            ? dmConversations.filter((c: Conversation) => (c.unread_count ?? 0) > 0)
            : dmConversations

    const selectedConversation = conversations.find(
        (c: Conversation) => c.id === selectedConversationId
    )

    // Auto-select first conversation when loaded
    useEffect(() => {
        if (conversations && conversations.length > 0 && !selectedConversationId) {
            setSelectedConversationId(conversations[0].id)
        }
    }, [conversations, selectedConversationId])

    const { data: messages = [], isLoading } = useMessages(selectedConversationId || 0)
    const sendMessage = useSendMessage(selectedConversationId || 0)
    const queryClient = useQueryClient()

    // Participants state
    const [participants, setParticipants] = useState<
        Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
    >({})

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    // Initialize participants from conversations data
    useEffect(() => {
        const conv = conversations?.find((c: Conversation) => c.id === selectedConversationId)
        if (!conv) return
        const usersList: User[] = conv.participants || []
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
    }, [conversations, selectedConversationId])

    // WebSocket for real-time updates
    const chatWs = useChatWebSocket({
        conversationId: selectedConversationId || 0,
        enabled: !!selectedConversationId,
        onMessage: (msg) => {
            // LOGGING
            console.log('Messages: Received WebSocket message', { msg, selectedConversationId })

            if (selectedConversationId && msg.conversation_id === selectedConversationId) {
                queryClient.setQueryData<Message[]>(
                    ['chat', 'messages', selectedConversationId],
                    (old) => {
                        console.log('Messages: Updating query cache for', selectedConversationId)
                        if (!old) return [msg]
                        if (Array.isArray(old)) {
                            if (old.some((m) => m.id === msg.id)) return old
                            return [...old, msg]
                        }
                        return old
                    }
                )
            } else {
                console.log('Messages: Ignoring message for different conversation', {
                    msgConf: msg.conversation_id,
                    selected: selectedConversationId,
                })
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

            // Update global presence store
            if (status === 'online') setOnline(userId)
            else setOffline(userId)
        },
        onConnectedUsers: (userIds) => {
            setInitialOnlineUsers(userIds)
        },
    })

    const handleSendMessage = () => {
        if (!newMessage.trim() || !selectedConversationId) return
        sendMessage.mutate(
            { content: newMessage, message_type: 'text' },
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

    const _getUserColor = (userId: number) => {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12', '#9b59b6', '#e74c3c', '#3498db']
        return colors[userId % colors.length]
    }

    // Get conversation display name (other person's name for DMs)
    const getConversationName = (conv: Conversation) => {
        if (conv.name) return conv.name
        const otherUser = conv.participants?.find((p) => p.id !== currentUser?.id)
        return otherUser?.username || 'Unknown User'
    }

    // Get avatar for conversation
    const getConversationAvatar = (conv: Conversation) => {
        const otherUser = conv.participants?.find((p) => p.id !== currentUser?.id)
        return (
            otherUser?.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${getConversationName(conv)}`
        )
    }

    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden">
            <Navbar />

            {convError && (
                <div className="bg-destructive/15 border-b border-destructive p-4">
                    <p className="text-sm text-destructive">
                        Error loading messages: {String(convError)}
                    </p>
                </div>
            )}

            {convLoading && (
                <div className="bg-muted border-b border-border p-4">
                    <p className="text-sm text-muted-foreground">Loading conversations...</p>
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Conversations (15%) */}
                <div className="w-[15%] border-r bg-card flex flex-col overflow-hidden">
                    <div className="p-4 border-b shrink-0">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <MessageCircle className="w-4 h-4" />
                            Messages
                        </h2>
                    </div>

                    {/* Tabs: ALL / UNREAD */}
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
                            ) : convError ? (
                                <div className="text-xs text-destructive text-center py-8">
                                    Error: {String(convError)}
                                </div>
                            ) : conversations && conversations.length > 0 ? (
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
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'hover:bg-accent'
                                            }`}
                                            onClick={() => setSelectedConversationId(conv.id)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <Avatar className="w-8 h-8">
                                                        <AvatarImage src={avatar} />
                                                        <AvatarFallback className="text-xs">
                                                            {name.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div
                                                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                                                            isOnline
                                                                ? 'bg-green-500'
                                                                : 'bg-gray-400'
                                                        }`}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium truncate text-xs">
                                                            {name}
                                                        </p>
                                                        {unread > 0 && (
                                                            <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
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

                {/* Center - Chat Window (70%) */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b p-4 shrink-0 bg-card">
                        <div className="flex items-center gap-3">
                            {selectedConversation && (
                                <>
                                    <Avatar className="w-8 h-8">
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
                                        <p className="text-xs text-muted-foreground">
                                            {(() => {
                                                const otherUser =
                                                    selectedConversation?.participants?.find(
                                                        (p) => p.id !== currentUser?.id
                                                    )
                                                return otherUser && onlineUserIds.has(otherUser.id)
                                                    ? 'Online'
                                                    : 'Offline'
                                            })()}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <ScrollArea className="flex-1 overflow-hidden" ref={scrollAreaRef}>
                        <div className="space-y-3 p-6">
                            {isLoading ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Loading messages...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No messages yet. Start the conversation!
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
                                            <Avatar className="w-8 h-8 shrink-0">
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
                                                className={`flex-1 min-w-0 ${isOwnMessage ? 'text-right' : ''}`}
                                            >
                                                <div
                                                    className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? 'justify-end' : ''}`}
                                                >
                                                    <span
                                                        className="font-semibold text-sm"
                                                        data-user-id={msg.sender_id}
                                                    >
                                                        {isOwnMessage
                                                            ? 'You'
                                                            : sender?.username || 'Unknown'}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatTimestamp(msg.created_at)}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`inline-block rounded-2xl px-4 py-2 ${
                                                        isOwnMessage
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                    }`}
                                                >
                                                    <p className="text-sm wrap-break-word">
                                                        {msg.content}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}

                            {Object.values(participants).some((p) => p.typing) && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

                    <div className="border-t bg-card p-4 shrink-0">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyPress={handleKeyPress}
                                className="flex-1"
                            />
                            <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar - Contact Info (15%) */}
                <div className="w-[15%] border-l bg-card flex flex-col overflow-hidden">
                    <div className="p-4 border-b shrink-0">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Contact
                        </h2>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-4">
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
                                            <Avatar className="w-16 h-16 mx-auto mb-3">
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
                                            <h3 className="font-semibold text-sm mb-1">
                                                {getConversationName(selectedConversation)}
                                            </h3>
                                            <div className="flex items-center justify-center gap-1.5">
                                                <div
                                                    className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
                                                />
                                                <span className="text-xs text-muted-foreground">
                                                    {isOnline ? 'Online' : 'Offline'}
                                                </span>
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
