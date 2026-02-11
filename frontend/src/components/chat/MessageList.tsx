import { memo } from 'react'
import type { Message } from '@/api/types'
import { MessageItem } from '@/components/chat/MessageItem'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  currentUserId?: number
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  currentUserId,
}: MessageListProps) {
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

  return (
    <div className='space-y-3'>
      {messages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          isOwnMessage={msg.sender_id === currentUserId}
        />
      ))}
    </div>
  )
})
