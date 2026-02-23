import {
  Bell,
  LogOut,
  PenSquare,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import {
  getRouteTitle,
  isRouteActive,
  type NavItem,
  topRouteNav,
  topServiceNav,
} from '@/components/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getCurrentUser, useIsAuthenticated, useLogout } from '@/hooks'
import {
  useAcceptFriendRequest,
  useFriends,
  useRejectFriendRequest,
} from '@/hooks/useFriends'
import { useNotificationStore } from '@/hooks/useRealtimeNotifications'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

function FriendsDropdown() {
  const { data: friends = [] } = useFriends()
  const { isUserOnline } = useChatContext()
  const { setActiveConversation, open } = useChatDockStore()

  return (
    <DropdownMenuContent align='center' className='w-64'>
      <DropdownMenuLabel className='flex items-center justify-between'>
        <span>Friends</span>
        <Link
          to='/friends'
          className='text-[10px] font-medium text-primary hover:underline'
        >
          View All
        </Link>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className='max-h-80 overflow-y-auto'>
        {friends.length === 0 ? (
          <div className='px-2 py-4 text-center text-xs text-muted-foreground'>
            No friends yet
          </div>
        ) : (
          friends.map(friend => {
            const isOnline = isUserOnline(friend.id)
            return (
              <DropdownMenuItem
                key={friend.id}
                className='flex items-center gap-3 py-2 cursor-pointer'
                onClick={() => {
                  // If we use negative IDs for virtual, we need to handle it here too
                  // or just let ChatDock handle it when it opens.
                  // For simplicity, let's use the virtual ID convention
                  setActiveConversation(-friend.id)
                  open()
                }}
              >
                <div className='relative shrink-0'>
                  <Avatar className='h-8 w-8'>
                    <AvatarImage src={friend.avatar} />
                    <AvatarFallback className='text-[10px]'>
                      {friend.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isOnline && (
                    <span className='absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-background bg-green-500' />
                  )}
                </div>
                <div className='flex flex-col min-w-0'>
                  <span className='truncate text-xs font-medium'>
                    {friend.username}
                  </span>
                  <span className='text-[10px] text-muted-foreground'>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </DropdownMenuItem>
            )
          })
        )}
      </div>
    </DropdownMenuContent>
  )
}

function NavPill({ item, active }: { item: NavItem; active: boolean }) {
  const isFriends = item.label === 'Friends'

  const content = (
    <div
      title={item.label}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap max-[1080px]:h-11 max-[1080px]:w-11 max-[1080px]:justify-center max-[1080px]:gap-0 max-[1080px]:rounded-xl max-[1080px]:px-0',
        active
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <item.icon className='h-4 w-4 max-[1080px]:h-5 max-[1080px]:w-5' />
      <span className='truncate max-[1080px]:hidden'>{item.label}</span>
    </div>
  )

  if (isFriends) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{content}</DropdownMenuTrigger>
        <FriendsDropdown />
      </DropdownMenu>
    )
  }

  return (
    <Link key={item.path} to={item.path} title={item.label}>
      {content}
    </Link>
  )
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const logout = useLogout()
  const notifications = useNotificationStore(state => state.items)
  const displayNotifications = useMemo(
    () => notifications.filter(item => item.meta?.type !== 'message'),
    [notifications]
  )
  const unreadCount = useMemo(
    () =>
      displayNotifications.filter((n: (typeof notifications)[0]) => !n.read)
        .length,
    [displayNotifications]
  )
  const markAllRead = useNotificationStore(state => state.markAllRead)
  const removeNotification = useNotificationStore(state => state.remove)
  const acceptReq = useAcceptFriendRequest()
  const rejectReq = useRejectFriendRequest()

  const handleNotificationClick = (item: (typeof notifications)[0]) => {
    if (item.meta?.type === 'message' && item.meta.conversationId) {
      navigate(`/chat/${item.meta.conversationId}`)
      removeNotification(item.id)
    }
  }

  if (!isAuthenticated) return null

  const pageTitle = getRouteTitle(location.pathname)
  const navItems = [...topRouteNav, ...topServiceNav]
  if (currentUser?.is_admin) {
    navItems.push({
      icon: ShieldCheck,
      label: 'Admin Console',
      path: '/admin',
    })
  }

  return (
    <header className='fixed top-0 left-0 right-0 z-50 hidden md:block'>
      <div className='border-b border-border/70 bg-background/92'>
        <div className='mx-auto flex h-14 w-full max-w-480 items-center gap-3 px-4 lg:px-5'>
          <Link to='/' className='inline-flex min-w-fit flex-col leading-none'>
            <span className='text-base font-black tracking-[0.16em] text-foreground uppercase'>
              Sanctum
            </span>
            <span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
              {pageTitle}
            </span>
          </Link>

          <div className='flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 max-[1080px]:gap-3'>
            {navItems.map(item => (
              <NavPill
                key={item.path}
                item={item}
                active={isRouteActive(location.pathname, item.path)}
              />
            ))}
          </div>

          <Link
            to='/users'
            className='hidden h-9 min-w-52 items-center gap-2 rounded-lg border border-border/60 bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground xl:flex'
          >
            <Search className='h-4 w-4' />
            <span>Search people and rooms</span>
          </Link>

          <div className='ml-auto flex shrink-0 items-center gap-1.5'>
            <Button
              asChild
              size='sm'
              className='hidden rounded-lg xl:inline-flex gap-1.5'
            >
              <Link to='/submit'>
                <PenSquare className='h-4 w-4' />
                Create Post
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  className='relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
                  aria-label='Notifications'
                >
                  <Bell className='h-4 w-4' />
                  {unreadCount > 0 && (
                    <span className='absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground'>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-80'>
                <DropdownMenuLabel className='flex items-center justify-between'>
                  <span>Notifications</span>
                  {notifications.length > 0 && unreadCount > 0 && (
                    <button
                      type='button'
                      onClick={markAllRead}
                      className='text-[11px] font-medium text-primary'
                    >
                      Mark all read
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {displayNotifications.length === 0 ? (
                  <div className='px-2 py-6 text-center text-xs text-muted-foreground'>
                    No notifications yet
                  </div>
                ) : (
                  displayNotifications
                    .slice(0, 8)
                    .map((item: (typeof notifications)[0]) => (
                      <DropdownMenuItem
                        key={item.id}
                        className={cn(
                          'flex flex-col items-start gap-2 py-2',
                          item.meta?.type === 'message' && 'cursor-pointer'
                        )}
                        onClick={() => handleNotificationClick(item)}
                      >
                        <div className='flex w-full items-start justify-between gap-2'>
                          <span className='text-xs font-semibold'>
                            {item.title}
                          </span>
                          {!item.read && (
                            <span className='mt-1 h-2 w-2 shrink-0 rounded-full bg-primary' />
                          )}
                        </div>
                        <div className='flex w-full items-center justify-between gap-2'>
                          <span className='line-clamp-2 text-[11px] text-muted-foreground flex-1'>
                            {item.description}
                          </span>
                          {item.meta?.type === 'friend_request' &&
                          item.meta.requestId ? (
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                className='text-[11px] rounded-md bg-emerald-600 px-2 py-1 text-emerald-foreground'
                                onClick={e => {
                                  e.stopPropagation()
                                  if (item.meta?.requestId) {
                                    acceptReq.mutate(item.meta.requestId)
                                    removeNotification(item.id)
                                  }
                                }}
                              >
                                Accept
                              </button>
                              <button
                                type='button'
                                className='text-[11px] rounded-md bg-destructive px-2 py-1 text-destructive-foreground'
                                onClick={e => {
                                  e.stopPropagation()
                                  if (item.meta?.requestId) {
                                    rejectReq.mutate(item.meta.requestId)
                                    removeNotification(item.id)
                                  }
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </DropdownMenuItem>
                    ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <ModeToggle />

            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type='button'
                    className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card transition-colors hover:bg-muted/50'
                  >
                    <Avatar className='h-9 w-9'>
                      <AvatarImage src={currentUser.avatar} />
                      <AvatarFallback>
                        {currentUser.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className='w-56' align='end'>
                  <DropdownMenuLabel className='font-normal'>
                    <div className='flex flex-col space-y-1'>
                      <div className='flex items-center gap-2'>
                        <p className='text-sm font-medium leading-none'>
                          {currentUser.username}
                        </p>
                        {currentUser.is_admin ? (
                          <span className='rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary'>
                            Admin
                          </span>
                        ) : null}
                      </div>
                      <p className='text-xs leading-none text-muted-foreground'>
                        {currentUser.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to='/profile' className='cursor-pointer'>
                      <User className='mr-2 h-5 w-5' />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className='cursor-pointer text-destructive focus:text-destructive'
                  >
                    <LogOut className='mr-2 h-5 w-5' />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
