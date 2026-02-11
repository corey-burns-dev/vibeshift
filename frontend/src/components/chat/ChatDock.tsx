import { MessageCircle, Minus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import type { Message } from '@/api/types'
import { ChatDockConversationList } from '@/components/chat/ChatDockConversationList'
import { ChatDockConversationView } from '@/components/chat/ChatDockConversationView'
import { Button } from '@/components/ui/button'
import { useConversation, useConversations } from '@/hooks/useChat'
import { getCurrentUser } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

export function ChatDock() {
  const currentUser = getCurrentUser()
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
    joinRoom,
    leaveRoom,
    sendTyping: ctxSendTyping,
    setOnMessage,
  } = useChatContext()

  // All conversation IDs we want to stay joined to for receiving messages
  const conversationIds = useMemo(
    () => conversations.map(c => c.id),
    [conversations]
  )

  // Join all conversation rooms
  useEffect(() => {
    for (const id of conversationIds) {
      joinRoom(id)
    }

    return () => {
      for (const id of conversationIds) {
        leaveRoom(id)
      }
    }
  }, [conversationIds, joinRoom, leaveRoom])

  // Join/leave active conversation
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
  }, [activeConversationId, conversationIds, joinRoom, leaveRoom])

  // Register message callback
  useEffect(() => {
    const handleMessage = (message: Message, conversationId: number) => {
      const state = useChatDockStore.getState()
      if (
        conversationId !== state.activeConversationId ||
        !state.isOpen ||
        state.minimized
      ) {
        if (message.sender_id !== currentUser?.id) {
          incrementUnread(conversationId)
        }
      }
    }

    setOnMessage(handleMessage)

    return () => {
      setOnMessage(undefined)
    }
  }, [currentUser?.id, incrementUnread, setOnMessage])

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
        type="button"
        onClick={toggle}
        className="fixed bottom-6 right-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 max-md:bottom-20"
      >
        <MessageCircle className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && !minimized && (
        <div
          className={cn(
            'fixed z-[60] flex flex-col rounded-xl border border-border bg-background shadow-2xl',
            // Desktop
            'bottom-20 right-6 h-[500px] w-[380px]',
            // Mobile
            'max-md:inset-x-2 max-md:bottom-20 max-md:h-[70dvh] max-md:w-auto'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
            <h2 className="truncate text-sm font-semibold">
              {view === 'conversation' ? conversationName : 'Messages'}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={minimize}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          {view === 'list' ? (
            <ChatDockConversationList
              conversations={conversations}
              currentUserId={currentUser?.id}
              onSelect={setActiveConversation}
            />
          ) : activeConversationId ? (
            <ChatDockConversationView
              conversationId={activeConversationId}
              conversation={activeConversation}
              currentUserId={currentUser?.id}
              sendTyping={sendTyping}
            />
          ) : null}
        </div>
      )}
    </>
  )
}
