import { MessageCircle, Minus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import type { Conversation, Message } from '@/api/types'
import { ChatDockConversationList } from '@/components/chat/ChatDockConversationList'
import { ChatDockConversationView } from '@/components/chat/ChatDockConversationView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAudio } from '@/hooks/useAudio'
import { useConversation, useConversations } from '@/hooks/useChat'
import { useFriends } from '@/hooks/useFriends'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { getCurrentUser } from '@/hooks/useUsers'
import { shouldPlayFriendDMInMessagesView } from '@/lib/chat-sounds'
import { getDirectMessageName } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

interface ChatDockPanelContentProps {
  view: 'list' | 'conversation'
  conversationName: string
  conversations: Conversation[]
  activeConversationId: number | null
  openConversationIds: number[]
  activeConversation: Conversation | undefined
  currentUserId: number | undefined
  typingUsers: string[]
  onMinimize: () => void
  onClose: () => void
  onSelectConversation: (id: number | null) => void
  onRemoveConversation: (id: number) => void
  onClearAll: () => void
  sendTyping: (isTyping: boolean) => void
  unreadByConversation: Record<string, number>
}

function ChatDockPanelContent({
  view,
  conversationName,
  conversations,
  activeConversationId,
  openConversationIds,
  activeConversation,
  currentUserId,
  typingUsers,
  onMinimize,
  onClose,
  onSelectConversation,
  onRemoveConversation,
  onClearAll,
  sendTyping,
  unreadByConversation,
}: ChatDockPanelContentProps) {
  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div className='flex items-center justify-between border-b border-border/50 px-4 py-2.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <h2 className='truncate text-sm font-semibold'>
            {view === 'conversation' ? conversationName : 'Friends'}
          </h2>
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={onMinimize}
          >
            <Minus className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      {openConversationIds.length > 0 && (
        <div className='flex items-center border-b border-border/50 bg-muted/30'>
          <div className='flex flex-1 items-center gap-1 overflow-x-auto p-1.5 no-scrollbar'>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size='sm'
              className={cn(
                'h-7 shrink-0 px-2.5 text-[11px] font-medium',
                view === 'list' && 'bg-background shadow-sm'
              )}
              onClick={() => onSelectConversation(null)}
            >
              All
            </Button>
            {openConversationIds.map(id => {
              const conv = conversations.find(c => c.id === id)
              if (!conv) return null
              const name = getDirectMessageName(conv, currentUserId)
              const isActive =
                view === 'conversation' && activeConversationId === id

              return (
                <div
                  key={id}
                  className={cn(
                    'group relative flex shrink-0 items-center rounded-md transition-colors',
                    isActive ? 'bg-background shadow-sm' : 'hover:bg-accent/50'
                  )}
                >
                  <Button
                    variant='ghost'
                    size='sm'
                    className={cn(
                      'h-7 px-2.5 text-[11px] font-medium transition-none',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                    onClick={() => onSelectConversation(id)}
                  >
                    {name}
                  </Button>
                  <button
                    type='button'
                    onClick={e => {
                      e.stopPropagation()
                      onRemoveConversation(id)
                    }}
                    className='flex h-7 w-6 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              )
            })}
          </div>
          {openConversationIds.length > 2 && (
            <Button
              variant='ghost'
              size='sm'
              className='h-7 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive'
              onClick={onClearAll}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {view === 'list' ? (
        <ChatDockConversationList
          conversations={conversations}
          currentUserId={currentUserId}
          unreadByConversation={unreadByConversation}
          onSelect={onSelectConversation}
        />
      ) : activeConversationId ? (
        <ChatDockConversationView
          conversationId={activeConversationId}
          conversation={activeConversation}
          currentUserId={currentUserId}
          sendTyping={sendTyping}
          typingUsers={typingUsers}
        />
      ) : null}
    </div>
  )
}

export function ChatDock() {
  const currentUser = getCurrentUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const [typingState, setTypingState] = useState<
    Record<number, Record<number, { username: string; expires: number }>>
  >({})
  const { playNewMessageSound } = useAudio()

  const {
    isOpen,
    minimized,
    view,
    activeConversationId,
    openConversationIds,
    toggle,
    minimize,
    close,
    setActiveConversation,
    removeOpenConversation,
    clearOpenConversations,
  } = useChatDockStore()

  const { data: conversations = [] } = useConversations()
  const { data: friends = [], isSuccess: friendsLoaded } = useFriends()
  const { data: activeConversation } = useConversation(
    activeConversationId || 0,
    { enabled: activeConversationId !== null && activeConversationId > 0 }
  )
  const isMessagesRoute =
    location.pathname.includes('/messages') ||
    location.pathname === '/chat' ||
    location.pathname.startsWith('/chat/')

  const friendUserIds = useMemo(
    () => new Set(friends.map((f: { id: number }) => f.id)),
    [friends]
  )

  const friendDMConversations = useMemo(
    () =>
      conversations.filter(c => {
        if (c.is_group) return false
        const other = c.participants?.find(p => p.id !== currentUser?.id)
        return other ? friendUserIds.has(other.id) : false
      }),
    [conversations, currentUser?.id, friendUserIds]
  )

  const friendDMConversationIds = useMemo(
    () => new Set(friendDMConversations.map(c => c.id)),
    [friendDMConversations]
  )

  const {
    joinRoom,
    leaveRoom,
    sendTyping: ctxSendTyping,
    unreadByConversation,
    incrementUnread,
    clearUnread,
    subscribeOnMessage,
    subscribeOnTyping,
  } = useChatContext()

  // Requirement: Auto-reconnect and re-subscribe to all rooms in OpenRooms
  // We'll also keep JOINED to all conversations for unread counts OR just use openConversationIds?
  // User says: "closing a tab unsubscribes from that room (and removes it from OpenRooms)"
  // This implies we ONLY stay joined to OpenRooms.

  useEffect(() => {
    // Join all currently "open" rooms
    for (const id of openConversationIds) {
      joinRoom(id)
    }

    // When this effect cleans up, we don't necessarily want to leave all rooms
    // unless the entire component is unmounting.
    // BUT we specifically want to leave rooms that are REMOVED from openConversationIds.
  }, [openConversationIds, joinRoom])

  // Track previously open IDs to know which ones were removed
  const prevOpenIdsRef = useRef<number[]>([])
  useEffect(() => {
    const removedIds = prevOpenIdsRef.current.filter(
      (id: number) => !openConversationIds.includes(id)
    )
    for (const id of removedIds) {
      leaveRoom(id)
    }
    prevOpenIdsRef.current = openConversationIds
  }, [openConversationIds, leaveRoom])

  useEffect(() => {
    if (!activeConversationId) return
    if (!isOpen || minimized) return
    clearUnread(activeConversationId)
  }, [activeConversationId, isOpen, minimized, clearUnread])

  // Typing indicators subscription
  useEffect(() => {
    const unsub = subscribeOnTyping(
      (convId, userId, username, isTyping, expiresInMs) => {
        if (userId === currentUser?.id) return

        setTypingState(prev => {
          const next = { ...prev }
          const roomTyping = { ...(next[convId] || {}) }

          if (isTyping) {
            roomTyping[userId] = {
              username,
              expires: Date.now() + (expiresInMs || 5000),
            }
          } else {
            delete roomTyping[userId]
          }

          if (Object.keys(roomTyping).length === 0) {
            delete next[convId]
          } else {
            next[convId] = roomTyping
          }
          return next
        })
      }
    )

    const interval = setInterval(() => {
      const now = Date.now()
      setTypingState(prev => {
        const next = { ...prev }
        let changed = false
        for (const convId of Object.keys(next)) {
          const cid = Number(convId)
          const roomTyping = { ...next[cid] }
          let roomChanged = false
          for (const userId of Object.keys(roomTyping)) {
            const uid = Number(userId)
            if (roomTyping[uid].expires < now) {
              delete roomTyping[uid]
              roomChanged = true
            }
          }
          if (roomChanged) {
            changed = true
            if (Object.keys(roomTyping).length === 0) {
              delete next[cid]
            } else {
              next[cid] = roomTyping
            }
          }
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [currentUser?.id, subscribeOnTyping])

  // Register message callback: increment unread and show toast for friend DMs only.
  useEffect(() => {
    const handleMessage = (message: Message, conversationId: number) => {
      if (message.sender_id === currentUser?.id) return

      // Only track/notify for friend 1-on-1 DMs
      if (!friendDMConversationIds.has(conversationId)) return
      // Chat.tsx owns unread transitions while user is in Messages view.
      if (isMessagesRoute) return

      const state = useChatDockStore.getState()

      // Suppress if user is viewing this conversation on the Chat page
      if (state.activePageConversationId === conversationId) return

      // Update unread count if it's not the currently active & visible dock conversation
      const isCurrentActive =
        conversationId === state.activeConversationId &&
        state.isOpen &&
        !state.minimized

      let newUnreadCount = 0
      if (!isCurrentActive) {
        newUnreadCount = incrementUnread(conversationId)

        const conv = friendDMConversations.find(c => c.id === conversationId)
        if (
          newUnreadCount === 1 &&
          shouldPlayFriendDMInMessagesView(
            conv ? { ...conv, is_friend_dm: friendsLoaded } : undefined,
            isMessagesRoute,
            newUnreadCount - 1
          )
        ) {
          playNewMessageSound()
        }
      }

      // Show toast if dock is closed, minimized, or viewing a different conversation
      const shouldShowToast =
        !state.isOpen ||
        state.minimized ||
        state.activeConversationId !== conversationId

      if (shouldShowToast) {
        const conv = friendDMConversations.find(c => c.id === conversationId)
        const conversationName = conv
          ? getDirectMessageName(conv, currentUser?.id)
          : 'Message'
        const senderName = message.sender?.username ?? 'Someone'
        const preview =
          message.content.length > 50
            ? `${message.content.slice(0, 50)}…`
            : message.content

        toast.message(`${senderName} in ${conversationName}`, {
          description: preview || 'New message',
          action: {
            label: 'Open',
            onClick: () => {
              useChatDockStore.getState().open()
              useChatDockStore.getState().setActiveConversation(conversationId)
            },
          },
        })
      }
    }

    const unsub = subscribeOnMessage(handleMessage)
    return () => unsub()
  }, [
    currentUser?.id,
    friendDMConversations,
    friendDMConversationIds,
    friendsLoaded,
    incrementUnread,
    isMessagesRoute,
    playNewMessageSound,
    subscribeOnMessage,
  ])

  // Keyboard shortcuts: Cmd/Ctrl+K toggle, Escape close (when not typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (isTyping) return

      if (e.key === 'Escape') {
        if (isOpen && !minimized) {
          e.preventDefault()
          close()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, minimized, close, toggle])

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (activeConversationId) {
        ctxSendTyping(activeConversationId, isTyping)
      }
    },
    [activeConversationId, ctxSendTyping]
  )

  const totalUnread = useMemo(() => {
    let count = 0
    for (const conv of friendDMConversations) {
      count += unreadByConversation[String(conv.id)] || 0
    }
    return count
  }, [friendDMConversations, unreadByConversation])

  const handleSelectConversation = useCallback(
    (id: number | null) => {
      setActiveConversation(id)
      if (id !== null) {
        clearUnread(id)
      }
    },
    [clearUnread, setActiveConversation]
  )

  const conversationName = activeConversation
    ? (() => {
        const other = activeConversation.participants?.find(
          p => p.id !== currentUser?.id
        )
        return other?.username || 'Friends'
      })()
    : 'Friends'

  const activeTypingUsers = useMemo(() => {
    if (!activeConversationId || !typingState[activeConversationId]) return []
    return Object.values(typingState[activeConversationId]).map(u => u.username)
  }, [activeConversationId, typingState])

  return (
    <>
      {/* Floating button */}
      <button
        type='button'
        onClick={toggle}
        className={cn(
          'fixed bottom-6 right-6 z-60 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:flex',
          isMobile ? 'hidden' : 'flex'
        )}
      >
        <MessageCircle className='h-5 w-5' />
        {totalUnread > 0 && (
          <span className='absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground'>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Panel: mobile = full-screen sheet, desktop = floating panel */}
      {isOpen &&
        !minimized &&
        (isMobile ? (
          <Dialog
            open={isOpen && !minimized}
            onOpenChange={open => {
              if (!open) close()
            }}
          >
            <DialogContent
              className={cn(
                'bottom-0 left-0 right-0 top-auto z-60 flex h-[90dvh] max-h-[90dvh] translate-x-0 translate-y-0 flex-col gap-0 rounded-t-xl border-t p-0',
                'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
                '[&>button]:hidden'
              )}
              aria-describedby={undefined}
            >
              <DialogTitle className='sr-only'>Friends</DialogTitle>
              <ChatDockPanelContent
                view={view}
                conversationName={conversationName}
                conversations={friendDMConversations}
                activeConversationId={activeConversationId}
                openConversationIds={openConversationIds}
                activeConversation={activeConversation}
                currentUserId={currentUser?.id}
                typingUsers={activeTypingUsers}
                onMinimize={minimize}
                onClose={close}
                onSelectConversation={handleSelectConversation}
                onRemoveConversation={removeOpenConversation}
                onClearAll={clearOpenConversations}
                sendTyping={sendTyping}
                unreadByConversation={unreadByConversation}
              />
            </DialogContent>
          </Dialog>
        ) : (
          <div
            className={cn(
              'fixed bottom-20 right-6 z-60 flex h-125 w-95 flex-col rounded-xl border border-border bg-background shadow-2xl 2xl:h-150 2xl:w-105'
            )}
          >
            <ChatDockPanelContent
              view={view}
              conversationName={conversationName}
              conversations={friendDMConversations}
              activeConversationId={activeConversationId}
              openConversationIds={openConversationIds}
              activeConversation={activeConversation}
              currentUserId={currentUser?.id}
              typingUsers={activeTypingUsers}
              onMinimize={minimize}
              onClose={close}
              onSelectConversation={handleSelectConversation}
              onRemoveConversation={removeOpenConversation}
              onClearAll={clearOpenConversations}
              sendTyping={sendTyping}
              unreadByConversation={unreadByConversation}
            />
          </div>
        ))}
    </>
  )
}
