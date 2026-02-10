import { Bell, LogOut, Search, ShieldCheck, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import {
  getRouteTitle,
  isRouteActive,
  type NavItem,
  topRouteNav,
  topServiceNav,
} from '@/components/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  useRejectFriendRequest,
} from '@/hooks/useFriends'
import { useNotificationStore } from '@/hooks/useRealtimeNotifications'
import { cn } from '@/lib/utils'

function NavPill({
  item,
  active,
  showLabel,
}: {
  item: NavItem
  active: boolean
  showLabel: boolean
}) {
  return (
    <Link
      key={item.path}
      to={item.path}
      title={item.label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      )}
    >
      <item.icon className="h-3.5 w-3.5" />
      {showLabel && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

export function TopBar() {
  const location = useLocation()
  const [iconsOnly, setIconsOnly] = useState(false)
  useEffect(() => {
    function update() {
      if (typeof window === 'undefined') return
      setIconsOnly(window.innerWidth >= 3840)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const logout = useLogout()
  const notifications = useNotificationStore(state => state.items)
  const unreadCount = useNotificationStore(state => state.unreadCount())
  const markAllRead = useNotificationStore(state => state.markAllRead)
  const removeNotification = useNotificationStore(state => state.remove)
  const acceptReq = useAcceptFriendRequest()
  const rejectReq = useRejectFriendRequest()

  if (!isAuthenticated) return null

  const pageTitle = getRouteTitle(location.pathname)
  const navItems = [...topRouteNav, ...topServiceNav]
  if (currentUser?.is_admin) {
    navItems.push({
      icon: ShieldCheck,
      label: 'Sanctum Admin',
      path: '/admin/sanctum-requests',
    })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 hidden md:block">
      <div className="border-b border-border/70 bg-background/75 shadow-lg backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-3 lg:px-4">
          <Link
            to="/"
            className="mr-4 inline-flex min-w-fit flex-col leading-none"
          >
            <span className="bg-linear-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-base font-black tracking-[0.18em] text-transparent uppercase">
              Sanctum
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {pageTitle}
            </span>
          </Link>

          <Link
            to="/users"
            className="ml-1 hidden h-9 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground xl:flex"
          >
            <Search className="h-4 w-4" />
            <span>Search people and rooms</span>
          </Link>

          <div className="ml-3 flex min-w-0 items-center gap-1 overflow-x-auto px-1">
            {navItems.map(item => (
              <NavPill
                key={item.path}
                item={item}
                active={isRouteActive(location.pathname, item.path)}
                showLabel={!iconsOnly}
              />
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifications</span>
                  {notifications.length > 0 && unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[11px] font-medium text-primary"
                    >
                      Mark all read
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  notifications.slice(0, 8).map(item => (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex flex-col items-start gap-2 py-2"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="text-xs font-semibold">
                          {item.title}
                        </span>
                        {!item.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="line-clamp-2 text-[11px] text-muted-foreground flex-1">
                          {item.description}
                        </span>
                        {item.meta?.type === 'friend_request' &&
                        item.meta.requestId ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-[11px] rounded-md bg-emerald-600 px-2 py-1 text-emerald-foreground"
                              onClick={() => {
                                if (item.meta?.requestId) {
                                  acceptReq.mutate(item.meta.requestId)
                                  removeNotification(item.id)
                                }
                              }}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="text-[11px] rounded-md bg-destructive px-2 py-1 text-destructive-foreground"
                              onClick={() => {
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
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/85 transition-colors hover:bg-card"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={currentUser.avatar} />
                      <AvatarFallback>
                        {currentUser.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-none">
                          {currentUser.username}
                        </p>
                        {currentUser.is_admin ? (
                          <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                            Admin
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs leading-none text-muted-foreground">
                        {currentUser.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
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
