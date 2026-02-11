import type { Conversation } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePresenceStore } from '@/hooks/usePresence'
import {
  deduplicateDMConversations,
  formatTimestamp,
  getDirectMessageAvatar,
  getDirectMessageName,
} from '@/lib/chat-utils'
import { cn } from '@/lib/utils'
import { useChatDockStore } from '@/stores/useChatDockStore'

interface ChatDockConversationListProps {
  conversations: Conversation[]
  currentUserId: number | undefined
  onSelect: (conversationId: number) => void
}

export function ChatDockConversationList({
  conversations,
  currentUserId,
  onSelect,
}: ChatDockConversationListProps) {
  const onlineUserIds = usePresenceStore(s => s.onlineUserIds)
  const unreadCounts = useChatDockStore(s => s.unreadCounts)

  // Merge deduplicated DMs + group chatrooms, sorted by last message time
  const dedupedDMs = deduplicateDMConversations(conversations, currentUserId)
  const groups = conversations.filter(c => c.is_group)
  const merged = [...dedupedDMs, ...groups]

  // Deduplicate by id (in case a group was already in both lists)
  const seen = new Set<number>()
  const unique = merged.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  // Sort by last_message.created_at desc
  unique.sort((a, b) => {
    const ta = a.last_message?.created_at || a.created_at
    const tb = b.last_message?.created_at || b.created_at
    return new Date(tb).getTime() - new Date(ta).getTime()
  })

  if (unique.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No conversations yet
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border/50">
        {unique.map(conv => {
          const isDM = !conv.is_group
          const name = isDM
            ? getDirectMessageName(conv, currentUserId)
            : conv.name || 'Unnamed Group'
          const avatar = isDM
            ? getDirectMessageAvatar(conv, currentUserId)
            : conv.avatar
          const otherUser = isDM
            ? conv.participants?.find(p => p.id !== currentUserId)
            : null
          const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false
          const unread = unreadCounts[conv.id] || 0
          const preview = conv.last_message?.content
          const time = conv.last_message?.created_at

          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
                unread > 0 && 'bg-primary/5'
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={avatar} />
                  <AvatarFallback className="text-xs">
                    {name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isDM && isOnline && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-sm',
                      unread > 0 ? 'font-semibold' : 'font-medium'
                    )}
                  >
                    {name}
                  </span>
                  {time && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatTimestamp(time)}
                    </span>
                  )}
                </div>
                {preview && (
                  <p className="truncate text-xs text-muted-foreground">
                    {preview}
                  </p>
                )}
              </div>

              {unread > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
