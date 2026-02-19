import { useVirtualizer } from '@tanstack/react-virtual'
import { memo } from 'react'
import type { Message } from '@/api/types'
import { MessageItem } from '@/components/chat/MessageItem'
import { cn } from '@/lib/utils'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  currentUserId?: number
  isDirectMessage?: boolean
  showReadReceipts?: boolean
  conversationId?: number
  isIRCStyle?: boolean
  showTimestamps?: boolean
  scrollElement?: HTMLDivElement | null
  getModerationActions?: (userId: number) => {
    canModerate: boolean
    canManageModerators: boolean
    isMuted?: boolean
    isBanned?: boolean
    isModerator?: boolean
    onKick?: () => void
    onTimeout?: () => void
    onToggleBan?: () => void
    onToggleModerator?: () => void
  } | undefined
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  currentUserId,
  isDirectMessage = false,
  showReadReceipts = false,
  conversationId,
  isIRCStyle = false,
  showTimestamps = true,
  scrollElement,
  getModerationActions,
}: MessageListProps) {
  const canVirtualize = Boolean(scrollElement) && messages.length > 100
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement ?? null,
    estimateSize: () => (isIRCStyle ? 22 : 62),
    overscan: 24,
    enabled: canVirtualize,
    getItemKey: index => messages[index]?.id ?? index,
  })

  if (isLoading) {
    return (
      <div className='flex-1 flex items-center justify-center text-muted-foreground text-sm'>
        Loading messages...
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className='flex-1 flex items-center justify-center text-muted-foreground text-sm'>
        No messages yet. Start the conversation!
      </div>
    )
  }

  if (!canVirtualize) {
    return (
      <div
        className={cn('flex flex-col', isIRCStyle ? 'space-y-0' : 'space-y-1')}
      >
        {messages.map(msg => (
          <MessageItem
            key={msg.id}
            message={msg}
            isOwnMessage={msg.sender_id === currentUserId}
            currentUserId={currentUserId}
            isDirectMessage={isDirectMessage}
            showReadReceipt={showReadReceipts}
            conversationId={conversationId}
            isIRCStyle={isIRCStyle}
            showTimestamps={showTimestamps}
            moderationActions={getModerationActions?.(msg.sender_id)}
          />
        ))}
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      className={cn('relative w-full', isIRCStyle ? '' : 'pt-1')}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map(virtualItem => {
        const msg = messages[virtualItem.index]
        if (!msg) return null

        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={node => {
              if (node) virtualizer.measureElement(node)
            }}
            className='absolute left-0 top-0 w-full'
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <MessageItem
              message={msg}
              isOwnMessage={msg.sender_id === currentUserId}
              currentUserId={currentUserId}
            isDirectMessage={isDirectMessage}
            showReadReceipt={showReadReceipts}
            conversationId={conversationId}
            isIRCStyle={isIRCStyle}
            showTimestamps={showTimestamps}
            moderationActions={getModerationActions?.(msg.sender_id)}
          />
          </div>
        )
      })}
    </div>
  )
})
