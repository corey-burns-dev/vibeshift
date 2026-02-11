import type { Conversation } from '@/api/types'

/** Consistent user colors for chat messages, keyed by userId */
export const USER_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#f39c12',
  '#9b59b6',
  '#e74c3c',
  '#3498db',
] as const

export function getUserColor(userId: number): string {
  return USER_COLORS[userId % USER_COLORS.length]
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

/** Fallback avatar URL with consistent size */
export function getAvatarUrl(seed: string | number, size = 150): string {
  return `https://i.pravatar.cc/${size}?u=${seed}`
}

/**
 * Resolve the display name for a DM conversation.
 * Falls back to the conversation name, then the other participant's username.
 */
export function getDirectMessageName(
  conversation: Conversation,
  currentUserId: number | undefined
): string {
  if (conversation.name) return conversation.name
  const otherUser = conversation.participants?.find(p => p.id !== currentUserId)
  return otherUser?.username || 'Unknown User'
}

/**
 * Resolve the avatar URL for a DM conversation.
 * Uses the other participant's avatar with a consistent pravatar fallback.
 */
export function getDirectMessageAvatar(
  conversation: Conversation,
  currentUserId: number | undefined
): string {
  const otherUser = conversation.participants?.find(p => p.id !== currentUserId)
  return (
    otherUser?.avatar ||
    getAvatarUrl(otherUser?.username || conversation.id, 80)
  )
}

/**
 * Deduplicate DM conversations by the other participant.
 * Keeps only the first conversation per unique other-user.
 */
export function deduplicateDMConversations(
  conversations: Conversation[],
  currentUserId: number | undefined
): Conversation[] {
  const direct = conversations.filter(c => !c.is_group)
  const deduped: Conversation[] = []
  const seenKeys = new Set<string>()
  for (const conv of direct) {
    const other = conv.participants?.find(p => p.id !== currentUserId)
    const key = other ? String(other.id) : `conv:${conv.id}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(conv)
  }
  return deduped
}

/** Build the WebSocket base URL from the current page location or VITE_API_URL */
export function getWsBaseUrl(): string {
  // If VITE_API_URL is an absolute URL, derive WS from it
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl?.startsWith('http')) {
    const url = new URL(apiUrl)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${url.host}`
  }

  // Fallback to same-origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host // includes port if present
  return `${protocol}//${host}`
}
