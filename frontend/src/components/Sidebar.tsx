import { LogOut, ShieldCheck, Sparkles, User } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { isRouteActive, sideNavSections } from '@/components/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  getCurrentUser,
  useIsAuthenticated,
  useLogout,
  useStreams,
} from '@/hooks'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const location = useLocation()
  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const logout = useLogout()

  const { data: streamsData } = useStreams()
  const liveStreams =
    streamsData?.streams.filter(stream => stream.is_live).slice(0, 3) || []

  if (!isAuthenticated) return null

  const navSections = sideNavSections.map(section => ({
    ...section,
    items: [...section.items],
  }))
  if (currentUser?.is_admin) {
    const services = navSections.find(section => section.title === 'Services')
    if (services) {
      services.items.push({
        icon: ShieldCheck,
        label: 'Sanctum Admin',
        path: '/admin/sanctum-requests',
      })
    }
  }

  return (
    <nav className="flex h-full min-h-[calc(100vh-6rem)] flex-col rounded-3xl border border-border/70 bg-card/70 p-4 shadow-xl backdrop-blur-xl">
      <Link
        to="/"
        className="mb-4 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/70"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/70 text-primary-foreground shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Sanctum
          </p>
          <p className="text-sm font-semibold">Play. Connect. Stream.</p>
        </div>
      </Link>

      <div className="space-y-5 overflow-y-auto pr-1">
        {navSections.map((section, sectionIndex) => (
          <section key={section.title} className="space-y-1.5">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item, itemIndex) => {
                const active = isRouteActive(location.pathname, item.path)

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'group/item flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all',
                      active
                        ? 'bg-primary/13 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    )}
                    style={{
                      animation: 'fadeInUp 360ms ease-out both',
                      animationDelay: `${sectionIndex * 80 + itemIndex * 36}ms`,
                    }}
                  >
                    <item.icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        active && 'text-primary'
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {item.label}
                      </span>
                      {item.hint ? (
                        <span className="block truncate text-xs text-muted-foreground/90">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        <section className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Live Now
            </p>
            <Link
              to="/streams"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {liveStreams.length > 0 ? (
            <div className="space-y-1">
              {liveStreams.map(stream => (
                <Link
                  key={stream.id}
                  to={`/streams/${stream.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/70"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8 border border-border/60">
                      <AvatarImage src={stream.user?.avatar} />
                      <AvatarFallback>
                        {stream.user?.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {stream.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {stream.viewer_count} watching
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No live streams right now.
            </p>
          )}
        </section>
      </div>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-background/70 px-2 py-2">
          <Avatar className="h-9 w-9 border border-border/60">
            <AvatarImage src={currentUser?.avatar} />
            <AvatarFallback>
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {currentUser?.username || 'User'}
              </p>
              {currentUser?.is_admin ? (
                <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                  Admin
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {currentUser?.email || 'No email'}
            </p>
          </div>
          <ModeToggle />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/profile"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-2 text-xs font-semibold transition-colors hover:bg-muted/60"
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </Link>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
