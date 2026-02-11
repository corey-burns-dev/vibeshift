import { MessageCircle, Send, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation, User } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useConversations,
  useLeaveConversation,
  useMessages,
  useSendMessage,
} from '@/hooks/useChat'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

export default function Messages() {
  const { id: urlConvId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [newMessage, setNewMessage] = useState('')
  const [messageTab, setMessageTab] = useState<'all' | 'unread'>('all')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<number | null>(null)
  const hasHydratedMessagesRef = useRef(false)
  const lastChimedMessageIdRef = useRef<number | null>(null)

  const onlineUserIds = usePresenceStore(state => state.onlineUserIds)
  const setOnline = usePresenceStore(state => state.setOnline)
  const setOffline = usePresenceStore(state => state.setOffline)
  const setInitialOnlineUsers = usePresenceStore(
    state => state.setInitialOnlineUsers
  )

  const currentUser = useMemo(() => getCurrentUser(), [])
  const {
    data: allConversations = [],
    isLoading: convLoading,
    error: convError,
  } = useConversations()

  // Filter and memoize conversations; collapse duplicate DMs by other participant.
  const dmConversations = useMemo(() => {
    const directConversations = allConversations.filter(
      (c: Conversation) => !c.is_group
    )
    const deduped: Conversation[] = []
    const seenKeys = new Set<string>()
    for (const conv of directConversations) {
      const other = conv.participants?.find(p => p.id !== currentUser?.id)
      const key = other ? String(other.id) : `conv:${conv.id}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      deduped.push(conv)
    }
    return deduped
  }, [allConversations, currentUser?.id])

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
    () =>
      conversations.find((c: Conversation) => c.id === selectedConversationId),
    [conversations, selectedConversationId]
  )
  const canAccessSelectedConversation = Boolean(
    selectedConversationId && selectedConversation
  )
  const selectedConversationOtherUserId = useMemo(
    () =>
      selectedConversation?.participants?.find(p => p.id !== currentUser?.id)
        ?.id,
    [selectedConversation, currentUser?.id]
  )
  const isSelectedConversationOtherUserOnline = useMemo(
    () =>
      selectedConversationOtherUserId
        ? onlineUserIds.has(selectedConversationOtherUserId)
        : false,
    [onlineUserIds, selectedConversationOtherUserId]
  )

  // Sync dock unread: reset only when conversation is loaded and in list (not URL-only)
  useEffect(() => {
    if (selectedConversation) {
      useChatDockStore.getState().resetUnread(selectedConversation.id)
    }
  }, [selectedConversation])

  // Auto-select first conversation if None is in URL
  useEffect(() => {
    if (conversations && conversations.length > 0 && !selectedConversationId) {
      navigate(`/messages/${conversations[0].id}`, { replace: true })
    }
  }, [conversations, selectedConversationId, navigate])

  useEffect(() => {
    if (!selectedConversationId) return
    if (convLoading) return
    if (selectedConversation) return

    const fallbackId = conversations[0]?.id
    if (fallbackId) {
      navigate(`/messages/${fallbackId}`, { replace: true })
      return
    }
    navigate('/messages', { replace: true })
  }, [
    selectedConversationId,
    selectedConversation,
    convLoading,
    conversations,
    navigate,
  ])

  const { data: messages = [], isLoading } = useMessages(
    selectedConversationId || 0,
    undefined,
    {
      enabled: canAccessSelectedConversation,
    }
  )
  const sendMessage = useSendMessage(selectedConversationId || 0)
  const leaveConversation = useLeaveConversation()

  // Participants state
  const [participants, setParticipants] = useState<
    Record<
      number,
      { id: number; username?: string; online?: boolean; typing?: boolean }
    >
  >({})

  // Scroll when messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const playIncomingMessageChime = useCallback(() => {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    const audioContext = new AudioContextClass()
    const startAt = audioContext.currentTime + 0.01
    const tones = [659.25, 880]

    tones.forEach((frequency, index) => {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const noteStart = startAt + index * 0.085
      const noteEnd = noteStart + 0.12

      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, noteStart)

      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.08, noteStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)

      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.start(noteStart)
      osc.stop(noteEnd)
    })

    window.setTimeout(() => {
      void audioContext.close()
    }, 700)
  }, [])

  useEffect(() => {
    if (!selectedConversationId || messages.length === 0) return

    const lastMessage = messages[messages.length - 1]
    const alreadyChimed = lastChimedMessageIdRef.current === lastMessage.id

    if (!hasHydratedMessagesRef.current) {
      hasHydratedMessagesRef.current = true
      lastChimedMessageIdRef.current = lastMessage.id
      return
    }

    if (!alreadyChimed && lastMessage.sender_id !== currentUser?.id) {
      playIncomingMessageChime()
      lastChimedMessageIdRef.current = lastMessage.id
    }
  }, [
    messages,
    selectedConversationId,
    currentUser?.id,
    playIncomingMessageChime,
  ])

  useEffect(() => {
    hasHydratedMessagesRef.current = false
    lastChimedMessageIdRef.current = null
  }, [])

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

  // Use shared ChatProvider WebSocket (no duplicate connection)
  const {
    joinRoom,
    leaveRoom,
    sendTyping: ctxSendTyping,
    setOnTyping: _setOnTyping,
    setOnPresence: _setOnPresence,
    setOnConnectedUsers: _setOnConnectedUsers,
    subscribeOnTyping,
    subscribeOnPresence,
    subscribeOnConnectedUsers,
  } = useChatContext()

  // Join/leave active conversation room
  useEffect(() => {
    if (!canAccessSelectedConversation || !selectedConversationId) return
    joinRoom(selectedConversationId)
    return () => {
      leaveRoom(selectedConversationId)
    }
  }, [
    canAccessSelectedConversation,
    selectedConversationId,
    joinRoom,
    leaveRoom,
  ])

  // Register typing, presence, and connected-users callbacks; cleanup on unmount
  useEffect(() => {
    const unsubTyping = subscribeOnTyping(
      (convId, userId, username, isTyping) => {
        if (convId !== selectedConversationId) return
        setParticipants(prev => ({
          ...(prev || {}),
          [userId]: {
            ...(prev?.[userId] || { id: userId, username }),
            typing: isTyping,
            online: true,
          },
        }))
      }
    )
    const unsubPresence = subscribeOnPresence((userId, username, status) => {
      const online = status === 'online' || status === 'connected'
      setParticipants(prev => ({
        ...(prev || {}),
        [userId]: { ...(prev?.[userId] || { id: userId, username }), online },
      }))
      if (status === 'online') setOnline(userId)
      else setOffline(userId)
    })
    const unsubConnected = subscribeOnConnectedUsers(userIds => {
      setInitialOnlineUsers(userIds)
    })
    return () => {
      unsubTyping()
      unsubPresence()
      unsubConnected()
    }
  }, [
    selectedConversationId,
    subscribeOnTyping,
    subscribeOnPresence,
    subscribeOnConnectedUsers,
    setOnline,
    setOffline,
    setInitialOnlineUsers,
  ])

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversationId) return
    const tempId = Date.now().toString()
    sendMessage.mutate(
      { content: newMessage, message_type: 'text', metadata: { tempId } },
      {
        onSuccess: () => {
          setNewMessage('')
          ctxSendTyping(selectedConversationId, false)
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
    if (selectedConversationId) ctxSendTyping(selectedConversationId, true)
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      if (selectedConversationId) ctxSendTyping(selectedConversationId, false)
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
      const otherUser = conv.participants?.find(p => p.id !== currentUser?.id)
      return otherUser?.username || 'Unknown User'
    },
    [currentUser]
  )

  // Get avatar for conversation
  const getConversationAvatar = useCallback(
    (conv: Conversation) => {
      const otherUser = conv.participants?.find(p => p.id !== currentUser?.id)
      return (
        otherUser?.avatar ||
        `https://i.pravatar.cc/150?u=${getConversationName(conv)}`
      )
    },
    [currentUser, getConversationName]
  )

  return (
    <div className='h-full min-h-0 flex-1 bg-background flex flex-col overflow-hidden'>
      {convError && (
        <div className='bg-destructive/15 border-b border-destructive p-4'>
          <p className='text-sm text-destructive'>
            Error loading messages: {String(convError)}
          </p>
        </div>
      )}

      <div className='h-full min-h-0 flex-1 flex overflow-hidden'>
        {/* Left Sidebar - Conversations (250px fixed) */}
        <div className='w-62.5 border-r bg-card flex flex-col overflow-hidden'>
          <div className='p-4 border-b shrink-0 h-15 flex items-center'>
            <h2 className='font-semibold text-sm flex items-center gap-2'>
              <MessageCircle className='w-4 h-4' />
              Direct Messages
            </h2>
          </div>

          <div className='flex border-b shrink-0'>
            <button
              type='button'
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
              type='button'
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

          <ScrollArea className='flex-1'>
            <div className='space-y-1 p-2'>
              {convLoading ? (
                <div className='text-xs text-muted-foreground text-center py-8'>
                  Loading...
                </div>
              ) : conversations.length > 0 ? (
                conversations.map((conv: Conversation) => {
                  const name = getConversationName(conv)
                  const avatar = getConversationAvatar(conv)
                  const otherUser = conv.participants?.find(
                    p => p.id !== currentUser?.id
                  )
                  const isOnline = otherUser
                    ? onlineUserIds.has(otherUser.id)
                    : false
                  const unread = conv.unread_count ?? 0

                  return (
                    <button
                      key={conv.id}
                      type='button'
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        conv.id === selectedConversationId
                          ? 'bg-secondary text-foreground font-semibold'
                          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => navigate(`/messages/${conv.id}`)}
                    >
                      <div className='flex items-center gap-3'>
                        <div className='relative shrink-0'>
                          <Avatar className='w-10 h-10 border'>
                            <AvatarImage src={avatar} />
                            <AvatarFallback className='text-xs'>
                              {name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                              isOnline ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                          />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center justify-between'>
                            <p className='font-medium truncate text-sm'>
                              {name}
                            </p>
                            <div className='flex items-center gap-2'>
                              {unread > 0 && (
                                <span className='bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full'>
                                  {unread}
                                </span>
                              )}
                              <button
                                type='button'
                                className='text-muted-foreground hover:text-destructive'
                                title='Remove conversation'
                                onClick={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  leaveConversation.mutate(conv.id, {
                                    onSuccess: () => {
                                      if (selectedConversationId === conv.id) {
                                        navigate('/messages', {
                                          replace: true,
                                        })
                                      }
                                    },
                                  })
                                }}
                              >
                                <Trash2 className='h-3.5 w-3.5' />
                              </button>
                            </div>
                          </div>
                          {conv.last_message && (
                            <p className='text-xs opacity-75 truncate'>
                              {conv.last_message.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className='text-xs text-muted-foreground text-center py-8'>
                  {messageTab === 'unread'
                    ? 'No unread messages'
                    : 'No conversations yet'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Center - Chat Window */}
        <div className='flex-1 flex flex-col overflow-hidden bg-background'>
          <div className='border-b px-6 h-15 flex items-center justify-between shrink-0 bg-card/30 backdrop-blur-sm'>
            <div className='flex items-center gap-3'>
              {selectedConversation && (
                <>
                  <Avatar className='w-8 h-8 border'>
                    <AvatarImage
                      src={getConversationAvatar(selectedConversation)}
                    />
                    <AvatarFallback className='text-xs'>
                      {getConversationName(selectedConversation)
                        .substring(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className='font-semibold text-sm'>
                      {getConversationName(selectedConversation)}
                    </h3>
                    <div className='flex items-center gap-1.5'>
                      <div
                        className={`w-2 h-2 rounded-full ${isSelectedConversationOtherUserOnline ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <p className='text-[10px] text-muted-foreground uppercase tracking-wider font-medium'>
                        {isSelectedConversationOtherUserOnline
                          ? 'Online'
                          : 'Offline'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <ScrollArea className='flex-1'>
            <div className='max-w-3xl mx-auto w-full space-y-4 p-6'>
              {isLoading ? (
                <div className='text-center py-8 text-muted-foreground text-sm'>
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-20 text-center'>
                  <div className='w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4'>
                    <MessageCircle className='w-8 h-8 text-muted-foreground' />
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                messages.map(msg => {
                  const isOwnMessage = msg.sender_id === currentUser?.id
                  const sender = msg.sender
                  return (
                    <div key={msg.id} className='flex items-start gap-3'>
                      <Avatar className='w-8 h-8 shrink-0 border'>
                        <AvatarImage
                          src={
                            sender?.avatar ||
                            `https://i.pravatar.cc/150?u=${sender?.username}`
                          }
                        />
                        <AvatarFallback className='text-xs'>
                          {sender?.username?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className='flex max-w-[70%] flex-col items-start'>
                        <div className='flex items-center gap-2 mb-1'>
                          <span className='font-semibold text-xs'>
                            {isOwnMessage ? 'You' : sender?.username || 'User'}
                          </span>
                          <span className='text-[10px] text-muted-foreground'>
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                        <div
                          className={`rounded-2xl px-4 py-2 text-sm ${
                            isOwnMessage
                              ? 'bg-primary text-primary-foreground rounded-tl-none'
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

              {Object.values(participants).some(p => p.typing) && (
                <div className='flex items-center gap-2 text-xs text-muted-foreground animate-pulse'>
                  <div className='flex gap-1'>
                    <span className='w-1 h-1 rounded-full bg-muted-foreground animate-bounce' />
                    <span className='w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]' />
                    <span className='w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]' />
                  </div>
                  <span>
                    {Object.values(participants)
                      .filter(p => p.typing)
                      .map(p => p.username)
                      .join(', ')}{' '}
                    is typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className='border-t p-4 shrink-0'>
            <div className='max-w-3xl mx-auto flex gap-2'>
              <Input
                placeholder='Type a message...'
                value={newMessage}
                onChange={e => handleInputChange(e.target.value)}
                onKeyPress={handleKeyPress}
                className='flex-1 rounded-full bg-secondary border-none px-4'
              />
              <Button
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
                variant='default'
                className='rounded-full w-10 h-10 p-0'
              >
                <Send className='w-4 h-4 text-primary-foreground' />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Contact Info (200px fixed) */}
        <div className='w-50 border-l bg-card hidden lg:flex flex-col overflow-hidden'>
          <div className='p-4 border-b shrink-0 h-15 flex items-center'>
            <h2 className='font-semibold text-sm flex items-center gap-2'>
              <Users className='w-4 h-4' />
              Details
            </h2>
          </div>
          <ScrollArea className='flex-1'>
            <div className='p-6'>
              {selectedConversation &&
                (() => {
                  const otherUser = selectedConversation.participants?.find(
                    p => p.id !== currentUser?.id
                  )
                  const isOnline = otherUser
                    ? onlineUserIds.has(otherUser.id)
                    : false

                  return (
                    <div className='text-center'>
                      <Avatar className='w-20 h-20 mx-auto mb-4 border-2 p-0.5'>
                        <AvatarImage
                          src={getConversationAvatar(selectedConversation)}
                        />
                        <AvatarFallback>
                          {getConversationName(selectedConversation)
                            .substring(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className='font-bold text-lg mb-1'>
                        {getConversationName(selectedConversation)}
                      </h3>
                      <div className='flex items-center justify-center gap-1.5 border py-1 px-3 rounded-full w-fit mx-auto'>
                        <div
                          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
                        />
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          {isOnline ? 'Active Now' : 'Offline'}
                        </span>
                      </div>

                      <div className='mt-8 text-left space-y-4'>
                        <div>
                          <p className='text-[10px] font-bold text-muted-foreground uppercase mb-1'>
                            About
                          </p>
                          <p className='text-xs'>
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
