import type { Message } from '@/api/types'

/**
 * Count unread messages for a conversation.
 * - Only counts messages sent by others (sender_id !== currentUserId)
 * - If `lastReadMessageId` is provided, only messages with `id > lastReadMessageId`
 *   count as unread (server message IDs are increasing).
 */
export function countUnreadMessages(
  messages: Message[] | undefined,
  lastReadMessageId?: number | null,
  currentUserId?: number | null
): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0
  return messages.filter(m => {
    if (typeof m.sender_id === 'number' && currentUserId === m.sender_id)
      return false
    if (typeof lastReadMessageId === 'number') {
      return typeof m.id === 'number' && m.id > lastReadMessageId
    }
    return true
  }).length
}

export default countUnreadMessages
