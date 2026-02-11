import { Link, useLocation } from 'react-router-dom'
import { isRouteActive, mobileNav } from '@/components/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getCurrentUser } from '@/hooks'
import { cn } from '@/lib/utils'

export function BottomBar() {
  const location = useLocation()
  const currentUser = getCurrentUser()

  return (
    <nav className='fixed inset-x-0 bottom-3 z-50 px-3 md:hidden'>
      <div className='mx-auto max-w-lg rounded-2xl border border-border/70 bg-background/78 p-2 shadow-xl backdrop-blur-xl'>
        <div className='grid grid-cols-5 gap-1'>
          {mobileNav.map(item => {
            const active = isRouteActive(location.pathname, item.path)

            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                <item.icon className='h-5 w-5' />
              </Link>
            )
          })}

          <Link
            to='/profile'
            title='Profile'
            aria-label='Profile'
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
              isRouteActive(location.pathname, '/profile')
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            )}
          >
            <Avatar className='h-6 w-6 border border-border/60'>
              <AvatarImage src={currentUser?.avatar || ''} />
              <AvatarFallback>
                {currentUser?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </nav>
  )
}
