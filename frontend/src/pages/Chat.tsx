import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Message, User } from '@/api/types'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { MessageList } from '@/components/chat/MessageList'
import { ParticipantsList } from '@/components/chat/ParticipantsList'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// import { ScrollArea } from "@/components/ui/scroll-area";
import {
    useAllChatrooms,
    useConversation,
    useJoinChatroom,
    useJoinedChatrooms,
    useMessages,
    useSendMessage,
} from '@/hooks/useChat'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'

export default function Chat() {
    const [newMessage, setNewMessage] = useState('')
    const [globalConversationId, setGlobalConversationId] = useState<number | null>(null)
    const [chatroomTab, setChatroomTab] = useState<'all' | 'joined'>('joined')
    const [messageError, setMessageError] = useState<string | null>(null)
    // removed unused scroll area ref to avoid repeated ref callbacks from Radix
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const onlineUserIds = usePresenceStore((state) => state.onlineUserIds)
    const setOnline = usePresenceStore((state) => state.setOnline)
    const setOffline = usePresenceStore((state) => state.setOffline)
    const setInitialOnlineUsers = usePresenceStore((state) => state.setInitialOnlineUsers)

    const currentUser = useMemo(() => getCurrentUser(), [])

    // Chatroom queries
    const { data: allChatrooms, isLoading: allLoading, error: allError } = useAllChatrooms()
    const {
        data: joinedChatrooms,
        isLoading: joinedLoading,
        error: joinedError,
    } = useJoinedChatrooms()
    const joinChatroom = useJoinChatroom()

    // Use the appropriate list based on active tab
    const conversations = chatroomTab === 'all' ? allChatrooms : joinedChatrooms
    const convLoading = chatroomTab === 'all' ? allLoading : joinedLoading
    const convError = chatroomTab === 'all' ? allError : joinedError

    // Auto-select first conversation when loaded
    useEffect(() => {
        if (conversations && conversations.length > 0 && !globalConversationId) {
            // Prefer joined conversations if possible
            const joined = conversations.find((c) => ('is_joined' in c ? c.is_joined : true))
            if (joined) {
                setGlobalConversationId(joined.id)
            } else {
                setGlobalConversationId(conversations[0].id)
            }
        }
    }, [conversations, globalConversationId])

    const { data: messages = [], isLoading } = useMessages(globalConversationId || 0)
    const sendMessage = useSendMessage(globalConversationId || 0)
    const queryClient = useQueryClient()

    // Fetch specific conversation details to ensure we have the latest "is_joined" status
    const { data: conversationDetails } = useConversation(globalConversationId || 0)

    // Use specific details if available, otherwise fallback to list (though list might be stale)
    const currentConversation =
        conversationDetails || conversations?.find((c) => c.id === globalConversationId)

    const isJoinedViaList = joinedChatrooms?.some((c) => c.id === globalConversationId)
    const userIsJoined = currentConversation?.is_joined || isJoinedViaList || false

    // Participants state
    const [participants, setParticipants] = useState<
        Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
    >({})

    // Keep chat scrolled to bottom when messages update
    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message list changes
    useEffect(() => {
        // requestAnimationFrame(() => {
        // 	messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        // });
    }, [messages.length])

    // Initialize participants from conversation details
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
                        online: !!(u as User & { online?: boolean }).online,
                        typing: false,
                    }
                }
            }
        }

        setParticipants(map)
    }, [currentConversation, currentUser])

    // ... (omitting lines for brevity, target content needs to match exactly)
    // Actually, I should target the ScrollArea render part mainly.

    // Let's split this into two calls or one contiguous block.
    // The render part is further down.

    // I will target the render part first.

    // WebSocket handlers
    const onMessage = useCallback((_msg: Message) => {
        // useChatWebSocket now handles cache updates automatically.
        // This callback can be used for side effects like playing a sound.
    }, [])

    const onPresence = useCallback(
        (userId: number, username: string, status: string) => {
            const online = status === 'online' || status === 'connected'
            setParticipants((prev) => ({
                ...prev,
                [userId]: { ...(prev?.[userId] || { id: userId, username }), online },
            }))
            if (status === 'online') setOnline(userId)
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
                    const uWithName = u as User & { name?: string; online?: boolean }
                    map[u.id] = {
                        id: u.id,
                        username: u.username ?? uWithName.name,
                        online: !!uWithName.online,
                        typing: false,
                    }
                }
            }
            setParticipants(map)
        },
        [currentUser]
    )

    // Only connect WebSocket if user is joined
    const { isJoined: wsIsJoined } = useChatWebSocket({
        conversationId: globalConversationId || 0,
        enabled: !!globalConversationId && userIsJoined,
        onMessage,
        onPresence,
        onConnectedUsers,
        onParticipantsUpdate,
    })

    const handleSendMessage = useCallback(() => {
        if (!newMessage.trim() || !globalConversationId || !currentUser) return

        const messageSize = new Blob([newMessage]).size
        if (messageSize > 512) {
            setMessageError(`Message too long (${messageSize}/512 bytes)`)
            setTimeout(() => setMessageError(null), 3000)
            return
        }

        setMessageError(null)
        const tempId = crypto.randomUUID()
        const messageContent = newMessage

        // Create optimistic message
        const tempMessage = {
            id: Date.now(), // Temporary numeric ID for List keys, will be replaced
            content: messageContent,
            sender_id: currentUser.id,
            sender: currentUser,
            created_at: new Date().toISOString(),
            conversation_id: globalConversationId,
            message_type: 'text' as const,
            metadata: { tempId }, // Store tempId in object for local check
            isOptimistic: true,
            is_read: true,
            updated_at: new Date().toISOString(),
        }

        // Optimistically add to UI
        queryClient.setQueryData<Message[]>(['chat', 'messages', globalConversationId], (old) => {
            return Array.isArray(old) ? [...old, tempMessage] : [tempMessage]
        })

        setNewMessage('') // Clear input immediately

        sendMessage.mutate(
            {
                content: messageContent,
                message_type: 'text',
                metadata: { tempId },
            },
            {
                onSuccess: (serverMessage) => {
                    // Replace optimistic message with server version
                    queryClient.setQueryData<Message[]>(
                        ['chat', 'messages', globalConversationId],
                        (old) => {
                            if (!Array.isArray(old)) return old
                            return old.map((m) => {
                                const mMeta = m.metadata as Record<string, unknown> | undefined
                                if (mMeta?.tempId === tempId) return serverMessage
                                return m
                            })
                        }
                    )
                },
                onError: () => {
                    // Remove optimistic message on failure
                    queryClient.setQueryData<Message[]>(
                        ['chat', 'messages', globalConversationId],
                        (old) => {
                            if (!Array.isArray(old)) return old
                            return old.filter((m) => {
                                const mMeta = m.metadata as Record<string, unknown> | undefined
                                return mMeta?.tempId !== tempId
                            })
                        }
                    )
                    setNewMessage(messageContent) // Restore message
                    setMessageError('Failed to send message')
                },
            }
        )
    }, [newMessage, globalConversationId, sendMessage, queryClient, currentUser])

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

    const handleSelectConversation = useCallback((id: number) => {
        setGlobalConversationId(id)
    }, [])

    const handleJoinConversation = useCallback(
        (id: number) => {
            joinChatroom.mutate(id)
        },
        [joinChatroom]
    )

    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden">
            <Navbar />

            {/* Error/Loading Banners */}
            {convError && (
                <div className="bg-destructive/15 border-b border-destructive p-4">
                    <p className="text-sm text-destructive">
                        Error loading conversations: {String(convError)}
                    </p>
                </div>
            )}
            {/* ... other banners if needed ... */}

            <div className="flex-1 flex overflow-hidden">
                <ChatSidebar
                    activeTab={chatroomTab}
                    setActiveTab={setChatroomTab}
                    conversations={conversations}
                    isLoading={convLoading}
                    error={convError}
                    selectedId={globalConversationId}
                    onSelect={handleSelectConversation}
                    onJoin={handleJoinConversation}
                    isJoining={joinChatroom.isPending}
                />

                {/* Center - Chat Window */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b p-4 shrink-0 bg-card">
                        <h3 className="font-semibold text-sm">
                            {conversations?.find((c) => c.id === globalConversationId)?.name ||
                                `Room ${globalConversationId}`}
                        </h3>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col">
                        <MessageList
                            messages={messages}
                            isLoading={isLoading}
                            currentUserId={currentUser?.id}
                        />
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input or Join Button */}
                    <div className="border-t bg-card p-4 shrink-0">
                        {messageError && (
                            <p className="text-xs text-destructive mb-2">{messageError}</p>
                        )}

                        {userIsJoined ? (
                            <div className="flex gap-2">
                                <Input
                                    placeholder={wsIsJoined ? 'Type a message...' : 'Connecting...'}
                                    value={newMessage}
                                    onChange={(e) => handleInputChange(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    disabled={!wsIsJoined}
                                    className="flex-1"
                                />
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim() || !wsIsJoined}
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-4 gap-4">
                                <p className="text-muted-foreground text-sm">
                                    You are not a member of this chatroom.
                                </p>
                                <Button
                                    onClick={() =>
                                        globalConversationId &&
                                        handleJoinConversation(globalConversationId)
                                    }
                                    disabled={joinChatroom.isPending}
                                    className="w-full sm:w-auto"
                                >
                                    {joinChatroom.isPending ? 'Joining...' : 'Join Chatroom'}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <ParticipantsList participants={participants} onlineUserIds={onlineUserIds} />
            </div>
        </div>
    )
}
