import { memo } from 'react'
import type { Message } from '@/api/types'
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatTimestamp, getAvatarUrl, getUserColor } from '@/lib/chat-utils'

interface MessageItemProps {
  message: Message
  isOwnMessage: boolean
}

export const MessageItem = memo(function MessageItem({
  message,
  isOwnMessage,
}: MessageItemProps) {
  const sender = message.sender

  return (
    <div className='flex items-start gap-2.5 group'>
      {sender ? (
        <UserMenu user={sender}>
          <Avatar className='w-7 h-7 shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity'>
            <AvatarImage src={sender.avatar || getAvatarUrl(sender.username)} />
            <AvatarFallback className='text-[10px]'>
              {sender.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </UserMenu>
      ) : (
        <Avatar className='w-7 h-7 shrink-0 mt-0.5'>
          <AvatarImage src={getAvatarUrl('unknown')} />
          <AvatarFallback className='text-[10px]'>U</AvatarFallback>
        </Avatar>
      )}
      <div className='flex-1 min-w-0'>
        <div className='flex items-baseline gap-2 mb-0.5'>
          {sender ? (
            <UserMenu user={sender}>
              <span
                className='font-semibold text-[13px] cursor-pointer hover:underline'
                style={{ color: getUserColor(message.sender_id) }}
              >
                {isOwnMessage ? 'You' : sender.username}
              </span>
            </UserMenu>
          ) : (
            <span
              className='font-semibold text-[13px]'
              style={{ color: getUserColor(message.sender_id) }}
            >
              Unknown
            </span>
          )}
          <span className='text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity'>
            {formatTimestamp(message.created_at)}
          </span>
        </div>
        <p className='text-[13px] leading-snug whitespace-pre-wrap wrap-break-word text-foreground/90'>
          {message.content}
        </p>
      </div>
    </div>
  )
})
