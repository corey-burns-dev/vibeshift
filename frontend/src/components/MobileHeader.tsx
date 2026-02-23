import { PenSquare, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { getRouteTitle } from '@/components/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getCurrentUser } from '@/hooks'

export function MobileHeader() {
  const location = useLocation()
  const currentUser = getCurrentUser()
  const pageTitle = getRouteTitle(location.pathname)

  return (
    <header className='fixed top-0 left-0 right-0 z-50 border-b border-border/70 bg-background/92 px-3 py-2 md:hidden'>
      <div className='flex h-12 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3'>
        <div className='min-w-0'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
            Sanctum
          </p>
          <p className='truncate text-sm font-semibold text-foreground'>
            {pageTitle}
          </p>
        </div>

        <div className='flex items-center gap-1'>
          <Link
            to='/users'
            className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
            aria-label='Search'
          >
            <Search className='h-4 w-4' />
          </Link>
          <Link
            to='/submit'
            className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
            aria-label='Create post'
          >
            <PenSquare className='h-4 w-4' />
          </Link>
          <ModeToggle />
          <Link
            to='/profile'
            className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80'
            aria-label='Profile'
          >
            <Avatar className='h-8 w-8'>
              <AvatarImage src={currentUser?.avatar || ''} />
              <AvatarFallback>
                {currentUser?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  )
}
