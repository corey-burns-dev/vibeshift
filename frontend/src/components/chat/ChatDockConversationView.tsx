import { ArrowLeft, Expand, Send, Smile } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Conversation } from '@/api/types'
import { MessageItem } from '@/components/chat/MessageItem'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMarkAsRead, useMessages, useSendMessage } from '@/hooks/useChat'
import { usePresenceStore } from '@/hooks/usePresence'
import { getDirectMessageName } from '@/lib/chat-utils'
import { useChatDockStore } from '@/stores/useChatDockStore'

interface ChatDockConversationViewProps {
  conversationId: number
  conversation: Conversation | undefined
  currentUserId: number | undefined
  sendTyping: (isTyping: boolean) => void
  typingUsers: string[]
}

const QUICK_EMOJI = ['😀', '😂', '😍', '👍', '🔥', '🎉', '😮', '🤝']

export function ChatDockConversationView({
  conversationId,
  conversation,
  currentUserId,
  sendTyping,
  typingUsers,
}: ChatDockConversationViewProps) {
  const navigate = useNavigate()
  const onlineUserIds = usePresenceStore(s => s.onlineUserIds)
  const {
    updateDraft,
    clearDraft,
    setActiveConversation,
    close,
    updateScrollPosition,
  } = useChatDockStore()

  const { data: messages = [] } = useMessages(conversationId)
  const sendMessage = useSendMessage(conversationId)
  const markAsRead = useMarkAsRead()

  const [inputValue, setInputValue] = useState(
    useChatDockStore.getState().drafts[conversationId] || ''
  )
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScrollingRef = useRef(false)
  const typingDebounceRef = useRef<number | undefined>(undefined)
  const typingInactivityRef = useRef<number | undefined>(undefined)
  const markAsReadRef = useRef(markAsRead)
  markAsReadRef.current = markAsRead
  const lastMarkedReadRef = useRef<number | null>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  }, [])

  // Restore scroll position on conversation switch
  useEffect(() => {
    const savedScroll =
      useChatDockStore.getState().scrollPositions[conversationId]
    const el = scrollRef.current
    if (el) {
      if (savedScroll !== undefined) {
        el.scrollTop = savedScroll
      } else {
        // Small timeout to ensure messages have rendered
        const timer = setTimeout(() => {
          scrollToBottom(false)
        }, 50)
        return () => clearTimeout(timer)
      }
    }
    setInputValue(useChatDockStore.getState().drafts[conversationId] || '')
  }, [conversationId, scrollToBottom])

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return
    const el = scrollRef.current
    if (el) {
      updateScrollPosition(conversationId, el.scrollTop)
    }
  }, [conversationId, updateScrollPosition])

  // Auto-scroll to bottom on new messages if near bottom
  useEffect(() => {
    if (messages.length === 0) return
    const el = scrollRef.current
    if (el) {
      const isNearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 150
      if (isNearBottom) {
        isAutoScrollingRef.current = true
        scrollToBottom(true)
        // updateScrollPosition will be called by onScroll if we don't block it,
        // but scrollToBottom(true) triggers many scroll events.
        // We use a longer timeout to cover smooth scroll duration.
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 500)
      }
    }
  }, [messages, scrollToBottom])

  const isDM = conversation ? !conversation.is_group : false
  // Mark as read once per conversation open (avoids refetch loop from invalidations).
  useEffect(() => {
    if (!isDM) return
    if (lastMarkedReadRef.current === conversationId) return
    lastMarkedReadRef.current = conversationId
    markAsReadRef.current.mutate(conversationId)
  }, [conversationId, isDM])

  const name = conversation
    ? isDM
      ? getDirectMessageName(conversation, currentUserId)
      : conversation.name || 'Unnamed Group'
    : 'Loading...'

  const otherUser = isDM
    ? conversation?.participants?.find(p => p.id !== currentUserId)
    : null
  const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return

    const tempId = Date.now().toString()
    sendMessage.mutate(
      { content: text, message_type: 'text', metadata: { tempId } },
      {
        onSuccess: () => {
          setInputValue('')
          setShowEmojiPicker(false)
          clearDraft(conversationId)
          sendTyping(false)
          // Always scroll to bottom when we send a message
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        },
      }
    )
  }, [inputValue, conversationId, sendMessage, clearDraft, sendTyping])

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value)
      updateDraft(conversationId, value)

      if (typingDebounceRef.current) {
        window.clearTimeout(typingDebounceRef.current)
      }
      typingDebounceRef.current = window.setTimeout(() => {
        if (value.trim()) sendTyping(true)
      }, 500)

      if (typingInactivityRef.current) {
        window.clearTimeout(typingInactivityRef.current)
      }
      typingInactivityRef.current = window.setTimeout(() => {
        sendTyping(false)
      }, 5000)
    },
    [conversationId, updateDraft, sendTyping]
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

  const handleExpand = useCallback(() => {
    if (conversation) {
      close()
      navigate(`/chat/${conversationId}`)
    }
  }, [conversation, conversationId, close, navigate])

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-2 border-b border-border/50 px-3 py-2'>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 shrink-0'
          onClick={() => setActiveConversation(null)}
        >
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            <span className='truncate text-sm font-medium'>{name}</span>
            {isDM && isOnline && (
              <span className='h-2 w-2 shrink-0 rounded-full bg-green-500' />
            )}
          </div>
        </div>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 shrink-0'
          onClick={handleExpand}
          title='Open full view'
        >
          <Expand className='h-3.5 w-3.5' />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className='flex-1' ref={scrollRef} onScroll={handleScroll}>
        <div className='space-y-1 p-2'>
          {messages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwnMessage={msg.sender_id === currentUserId}
              currentUserId={currentUserId}
              isDirectMessage={isDM}
              showReadReceipt={isDM}
              conversationId={conversationId}
            />
          ))}
          {messages.length === 0 && (
            <p className='py-8 text-center text-xs text-muted-foreground'>
              No messages yet. Say hello!
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className='flex flex-col border-t border-border/50 bg-card/25 px-3 py-2'>
        <TypingIndicator typingUsers={typingUsers} className='mb-1.5' />
        <div className='flex items-center gap-2'>
          <div className='relative flex-1'>
            <Input
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder='Type a message...'
              className='h-8 pr-10 text-sm'
            />
            <button
              type='button'
              onClick={() => setShowEmojiPicker(prev => !prev)}
              className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground'
              title='Insert emoji'
            >
              <Smile className='h-3.5 w-3.5' />
            </button>
            {showEmojiPicker && (
              <div className='absolute bottom-10 right-0 z-30 flex max-w-44 flex-wrap gap-1 rounded-lg border border-border bg-card p-2 shadow-lg'>
                {QUICK_EMOJI.map(emoji => (
                  <button
                    key={`dock-emoji-${emoji}`}
                    type='button'
                    onClick={() => {
                      setInputValue(prev => {
                        const next = `${prev}${emoji}`
                        updateDraft(conversationId, next)
                        return next
                      })
                      setShowEmojiPicker(false)
                    }}
                    className='inline-flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-muted'
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 shrink-0'
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            <Send className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}
