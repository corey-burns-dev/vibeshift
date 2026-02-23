import { MessageCircle } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isRouteActive, mobileNav } from '@/components/navigation'
import { useConversations } from '@/hooks/useChat'
import { useFriends } from '@/hooks/useFriends'
import { useIsAuthenticated } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

export function BottomBar() {
  const location = useLocation()
  const isAuthenticated = useIsAuthenticated()
  const { toggle, isOpen, minimized } = useChatDockStore()
  const { unreadByConversation } = useChatContext()

  const { data: conversations = [] } = useConversations()
  const { data: friends = [] } = useFriends()

  const totalUnread = useMemo(() => {
    const friendIds = new Set(friends.map(f => f.id))
    const friendConvs = conversations.filter(c => {
      if (c.is_group) return false
      return c.participants?.some(p => friendIds.has(p.id))
    })

    return friendConvs.reduce(
      (acc, c) => acc + (unreadByConversation[String(c.id)] || 0),
      0
    )
  }, [friends, conversations, unreadByConversation])

  if (!isAuthenticated) return null

  return (
    <nav className='fixed inset-x-0 bottom-2 z-50 px-3 md:hidden'>
      <div className='mx-auto max-w-lg rounded-lg border border-border/70 bg-background/94 p-2'>
        <div
          className='grid gap-1'
          style={{
            gridTemplateColumns: `repeat(${mobileNav.length + 1}, 1fr)`,
          }}
        >
          {mobileNav.map(item => {
            const active = isRouteActive(location.pathname, item.path)

            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <item.icon className='h-5 w-5' />
              </Link>
            )
          })}

          <button
            type='button'
            onClick={toggle}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors',
              isOpen && !minimized
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            <MessageCircle className='h-5 w-5' />
            {totalUnread > 0 && (
              <span className='absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground'>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  )
}
