import { Flag } from 'lucide-react'
import { memo, useMemo } from 'react'
import { toast } from 'sonner'
import type { Message, MessageReactionSummary } from '@/api/types'
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  useAddMessageReaction,
  useRemoveMessageReaction,
} from '@/hooks/useChat'
import { useReportMessage } from '@/hooks/useModeration'
import { formatTimestamp, getAvatarUrl, getUserColor } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

interface MessageItemProps {
  message: Message
  isOwnMessage: boolean
  currentUserId?: number
  isDirectMessage?: boolean
  showReadReceipt?: boolean
  conversationId?: number
  isIRCStyle?: boolean
  showTimestamps?: boolean
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮']

function computeReactionSummary(
  message: Message,
  currentUserId?: number
): MessageReactionSummary[] {
  if (Array.isArray(message.reaction_summary)) {
    return message.reaction_summary
  }

  const reactions = Array.isArray(message.reactions) ? message.reactions : []
  if (reactions.length === 0) return []

  const byEmoji = new Map<string, { count: number; reacted_by_me: boolean }>()
  for (const reaction of reactions) {
    const previous = byEmoji.get(reaction.emoji) || {
      count: 0,
      reacted_by_me: false,
    }
    byEmoji.set(reaction.emoji, {
      count: previous.count + 1,
      reacted_by_me:
        previous.reacted_by_me || reaction.user_id === currentUserId,
    })
  }

  return Array.from(byEmoji.entries()).map(([emoji, value]) => ({
    emoji,
    count: value.count,
    reacted_by_me: value.reacted_by_me,
  }))
}

function formatReadReceipt(message: Message): string {
  if (!message.is_read) return 'Sent'
  if (!message.read_at) return 'Read'
  return `Read ${new Date(message.read_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function renderMessageWithMentions(content: string) {
  const tokens = content.split(/(@[a-zA-Z0-9_]{2,32})/g)
  let cursor = 0
  return tokens.map(token => {
    const tokenStart = cursor
    cursor += token.length
    const key = `${tokenStart}:${token}`
    const isMention = /^@[a-zA-Z0-9_]{2,32}$/.test(token)
    if (!isMention) {
      return <span key={`plain-${key}`}>{token}</span>
    }
    return (
      <span
        key={`mention-${key}`}
        className='rounded bg-primary/15 px-1 py-0.5 font-semibold text-primary'
      >
        {token}
      </span>
    )
  })
}

export const MessageItem = memo(function MessageItem({
  message,
  isOwnMessage,
  currentUserId,
  isDirectMessage = false,
  showReadReceipt = false,
  conversationId,
  isIRCStyle = false,
  showTimestamps = true,
}: MessageItemProps) {
  const sender = message.sender
  const resolvedConversationId = conversationId ?? message.conversation_id
  const reactionSummary = useMemo(
    () => computeReactionSummary(message, currentUserId),
    [message, currentUserId]
  )

  const addReaction = useAddMessageReaction(resolvedConversationId)
  const removeReaction = useRemoveMessageReaction(resolvedConversationId)
  const reportMessage = useReportMessage()

  const toggleReaction = (emoji: string) => {
    const existing = reactionSummary.find(item => item.emoji === emoji)
    if (existing?.reacted_by_me) {
      removeReaction.mutate({ messageId: message.id, emoji })
      return
    }
    addReaction.mutate({ messageId: message.id, emoji })
  }

  const handleReport = () => {
    if (!resolvedConversationId) return
    const reason = window.prompt('Reason for reporting this message?')?.trim()
    if (!reason) return
    const details = window.prompt('Additional details (optional)')?.trim()
    reportMessage.mutate(
      {
        conversationId: resolvedConversationId,
        messageId: message.id,
        payload: { reason, details },
      },
      {
        onSuccess: () => toast.success('Message reported'),
        onError: () => toast.error('Failed to report message'),
      }
    )
  }

  const renderUsername = (isBold = false) => {
    if (!sender) {
      return (
        <span
          className={cn('text-[13px]', isBold ? 'font-bold' : 'font-semibold')}
          style={{ color: getUserColor(message.sender_id) }}
        >
          Unknown
        </span>
      )
    }

    return (
      <UserMenu user={sender}>
        <span
          className={cn(
            'cursor-pointer text-[13px] hover:underline',
            isBold ? 'font-bold' : 'font-semibold'
          )}
          style={{ color: getUserColor(message.sender_id) }}
        >
          {isOwnMessage && isDirectMessage ? 'You' : sender.username}
          {isIRCStyle ? ':' : ''}
        </span>
      </UserMenu>
    )
  }

  if (isIRCStyle) {
    return (
      <div
        className={cn(
          'group flex items-baseline gap-1 py-px leading-none',
          !showTimestamps && 'pl-2'
        )}
      >
        {showTimestamps && (
          <span className='shrink-0 text-[10px] text-muted-foreground/60 transition-opacity'>
            [{formatTimestamp(message.created_at)}]
          </span>
        )}
        <div className='min-w-0 flex-1 flex items-baseline gap-1'>
          {renderUsername(true)}
          <p className='wrap-break-word whitespace-pre-wrap text-[13px] leading-snug text-foreground/90'>
            {renderMessageWithMentions(message.content)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='group relative flex items-start gap-2 py-0.5'>
      {sender ? (
        <UserMenu user={sender}>
          <Avatar className='h-6 w-6 shrink-0 cursor-pointer transition-opacity hover:opacity-80'>
            <AvatarImage src={sender.avatar || getAvatarUrl(sender.username)} />
            <AvatarFallback className='text-[10px]'>
              {sender.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </UserMenu>
      ) : (
        <Avatar className='h-6 w-6 shrink-0'>
          <AvatarImage src={getAvatarUrl('unknown')} />
          <AvatarFallback className='text-[10px]'>U</AvatarFallback>
        </Avatar>
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1.5'>
          {renderUsername()}
          {showTimestamps && (
            <span className='text-[9px] text-muted-foreground/60'>
              {formatTimestamp(message.created_at)}
            </span>
          )}

          {/* Applied Reactions */}
          {reactionSummary.length > 0 && (
            <div className='flex items-center gap-1'>
              {reactionSummary.map(reaction => (
                <button
                  key={`${message.id}-${reaction.emoji}`}
                  type='button'
                  onClick={() => toggleReaction(reaction.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] transition-colors ${
                    reaction.reacted_by_me
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/70 bg-card hover:bg-muted/70'
                  }`}
                >
                  <span>{reaction.emoji}</span>
                  <span className='font-medium'>{reaction.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick Reactions: Show on hover beside timestamp */}
          <div className='flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
            {QUICK_REACTIONS.map(emoji => (
              <button
                key={`${message.id}-quick-${emoji}`}
                type='button'
                onClick={() => toggleReaction(emoji)}
                className='inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] transition-colors hover:bg-muted'
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {!isOwnMessage && (
            <button
              type='button'
              onClick={handleReport}
              className='ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100'
              title='Report message'
            >
              <Flag className='h-3 w-3' />
            </button>
          )}
        </div>

        <p className='wrap-break-word whitespace-pre-wrap text-[13px] leading-snug text-foreground/90'>
          {renderMessageWithMentions(message.content)}
        </p>

        {showReadReceipt && isDirectMessage && isOwnMessage && (
          <p className='text-[9px] text-muted-foreground/70'>
            {formatReadReceipt(message)}
          </p>
        )}
      </div>
    </div>
  )
})
