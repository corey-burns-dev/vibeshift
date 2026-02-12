import { MessageCircle, Minus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import type { Conversation, Message } from '@/api/types'
import { ChatDockConversationList } from '@/components/chat/ChatDockConversationList'
import { ChatDockConversationView } from '@/components/chat/ChatDockConversationView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useConversation, useConversations } from '@/hooks/useChat'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { getCurrentUser } from '@/hooks/useUsers'
import { getDirectMessageName } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

interface ChatDockPanelContentProps {
  view: 'list' | 'conversation'
  conversationName: string
  conversations: Conversation[]
  activeConversationId: number | null
  activeConversation: Conversation | undefined
  currentUserId: number | undefined
  onMinimize: () => void
  onClose: () => void
  onSelectConversation: (id: number) => void
  sendTyping: (isTyping: boolean) => void
}

function ChatDockPanelContent({
  view,
  conversationName,
  conversations,
  activeConversationId,
  activeConversation,
  currentUserId,
  onMinimize,
  onClose,
  onSelectConversation,
  sendTyping,
}: ChatDockPanelContentProps) {
  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div className='flex items-center justify-between border-b border-border/50 px-4 py-2.5'>
        <h2 className='truncate text-sm font-semibold'>
          {view === 'conversation' ? conversationName : 'Messages'}
        </h2>
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
      {view === 'list' ? (
        <ChatDockConversationList
          conversations={conversations}
          currentUserId={currentUserId}
          onSelect={onSelectConversation}
        />
      ) : activeConversationId ? (
        <ChatDockConversationView
          conversationId={activeConversationId}
          conversation={activeConversation}
          currentUserId={currentUserId}
          sendTyping={sendTyping}
        />
      ) : null}
    </div>
  )
}

export function ChatDock() {
  const currentUser = getCurrentUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const {
    isOpen,
    minimized,
    view,
    activeConversationId,
    unreadCounts,
    toggle,
    minimize,
    close,
    setActiveConversation,
    incrementUnread,
  } = useChatDockStore()

  const { data: conversations = [] } = useConversations()
  const { data: activeConversation } = useConversation(
    activeConversationId || 0,
    { enabled: activeConversationId !== null && activeConversationId > 0 }
  )

  const {
    isConnected,
    joinRoom,
    leaveRoom,
    sendTyping: ctxSendTyping,
    subscribeOnMessage,
  } = useChatContext()

  // All conversation IDs we want to stay joined to for receiving messages
  const conversationIds = useMemo(
    () => conversations.map(c => c.id),
    [conversations]
  )

  // Join all conversation rooms; re-run when socket opens so late-connect doesn't drop joins
  // biome-ignore lint/correctness/useExhaustiveDependencies: isConnected needed to retry room joins when socket opens late
  useEffect(() => {
    for (const id of conversationIds) {
      joinRoom(id)
    }

    return () => {
      for (const id of conversationIds) {
        leaveRoom(id)
      }
    }
  }, [conversationIds, isConnected, joinRoom, leaveRoom])

  // Join/leave active conversation; re-run when socket opens for late-connect
  // biome-ignore lint/correctness/useExhaustiveDependencies: isConnected needed to retry room join when socket opens late
  useEffect(() => {
    if (activeConversationId) {
      joinRoom(activeConversationId)
      return () => {
        // Don't leave if it's in the conversation list
        if (!conversationIds.includes(activeConversationId)) {
          leaveRoom(activeConversationId)
        }
      }
    }
  }, [activeConversationId, conversationIds, isConnected, joinRoom, leaveRoom])

  // Register message callback: increment unread and show toast when appropriate.
  // Re-run when pathname changes so we re-register after leaving /messages or /chat
  // (those pages take over the callback while mounted).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname intentionally re-runs to re-register callback
  useEffect(() => {
    const handleMessage = (message: Message, conversationId: number) => {
      if (message.sender_id === currentUser?.id) return

      const conv = conversations.find(
        (conversation: Conversation) => conversation.id === conversationId
      )
      if (!conv) return

      const state = useChatDockStore.getState()
      const isCurrentConversation =
        conversationId === state.activeConversationId &&
        state.isOpen &&
        !state.minimized
      if (isCurrentConversation) return

      incrementUnread(conversationId)

      // Show toast when dock is closed, minimized, or another conversation is active
      const conversationName = conv
        ? conv.is_group
          ? conv.name || 'Unnamed Group'
          : getDirectMessageName(conv, currentUser?.id)
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

    const unsub = subscribeOnMessage(handleMessage)
    return () => {
      unsub()
    }
  }, [
    currentUser?.id,
    conversations,
    incrementUnread,
    subscribeOnMessage,
    location.pathname,
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

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  const conversationName = activeConversation
    ? activeConversation.is_group
      ? activeConversation.name || 'Unnamed Group'
      : (() => {
          const other = activeConversation.participants?.find(
            p => p.id !== currentUser?.id
          )
          return other?.username || 'Messages'
        })()
    : 'Messages'

  return (
    <>
      {/* Floating button */}
      <button
        type='button'
        onClick={toggle}
        className='fixed bottom-6 right-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 max-md:bottom-20'
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
                'bottom-0 left-0 right-0 top-auto z-[60] flex h-[90dvh] max-h-[90dvh] translate-x-0 translate-y-0 flex-col gap-0 rounded-t-xl border-t p-0',
                'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
                '[&>button]:hidden'
              )}
              aria-describedby={undefined}
            >
              <DialogTitle className='sr-only'>Messages</DialogTitle>
              <ChatDockPanelContent
                view={view}
                conversationName={conversationName}
                conversations={conversations}
                activeConversationId={activeConversationId}
                activeConversation={activeConversation}
                currentUserId={currentUser?.id}
                onMinimize={minimize}
                onClose={close}
                onSelectConversation={setActiveConversation}
                sendTyping={sendTyping}
              />
            </DialogContent>
          </Dialog>
        ) : (
          <div
            className={cn(
              'fixed bottom-20 right-6 z-[60] flex h-[500px] w-[380px] flex-col rounded-xl border border-border bg-background shadow-2xl'
            )}
          >
            <ChatDockPanelContent
              view={view}
              conversationName={conversationName}
              conversations={conversations}
              activeConversationId={activeConversationId}
              activeConversation={activeConversation}
              currentUserId={currentUser?.id}
              onMinimize={minimize}
              onClose={close}
              onSelectConversation={setActiveConversation}
              sendTyping={sendTyping}
            />
          </div>
        ))}
    </>
  )
}
