import type { Conversation } from '@/api/types'

/**
 * Pure helpers for when to play chat notification sounds.
 * Used by Chat.tsx so conditions can be unit-tested and stay consistent.
 */

/**
 * Whether we should play the new-message sound for an incoming DM.
 * Play when: viewing a DM conversation (not a group), and the message is from someone else.
 */
export function shouldPlayNewMessageSoundForDM(
  isCurrentConversationGroup: boolean,
  messageSenderId: number,
  currentUserId: number | undefined
): boolean {
  if (isCurrentConversationGroup) return false
  if (currentUserId === undefined) return false
  return messageSenderId !== currentUserId
}

type FriendDMConversationForSound = Pick<Conversation, 'is_group'> & {
  is_friend_dm?: boolean
}

/**
 * Play DM notification sound only when:
 * - conversation is a direct message with a friend
 * - user is in Messages view
 * - unread transitions from 0 -> 1 for that conversation
 */
export function shouldPlayFriendDMInMessagesView(
  conversation: FriendDMConversationForSound | null | undefined,
  isMessagesRoute: boolean,
  prevUnreadCount: number
): boolean {
  if (!isMessagesRoute) return false
  if (prevUnreadCount !== 0) return false
  if (!conversation || conversation.is_group) return false
  return conversation.is_friend_dm === true
}

/**
 * Whether we should play the friend-online sound for a presence update.
 * Play when: user is coming online/connected, not self, not already notified, and user is a friend.
 */
export function shouldPlayFriendOnlineSound(
  userId: number,
  status: string,
  currentUserId: number | undefined,
  notifiedUserIds: Set<number>,
  friendIds: number[]
): boolean {
  const online = status === 'online' || status === 'connected'
  if (!online) return false
  if (currentUserId === undefined || userId === currentUserId) return false
  if (notifiedUserIds.has(userId)) return false
  return friendIds.includes(userId)
}
