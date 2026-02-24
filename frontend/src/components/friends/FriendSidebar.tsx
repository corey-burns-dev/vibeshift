import { Settings, UserCheck, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FriendSidebarProps {
  activeView: 'suggestions' | 'requests' | 'friends'
  onViewChange: (view: 'suggestions' | 'requests' | 'friends') => void
  requestCount?: number
}

export function FriendSidebar({
  activeView,
  onViewChange,
  requestCount = 0,
}: FriendSidebarProps) {
  type NavItem = {
    id: 'suggestions' | 'requests' | 'friends'
    label: string
    icon: React.ElementType
    badge?: number
  }

  const navItems: NavItem[] = [
    {
      id: 'suggestions',
      label: 'Suggestions',
      icon: UserPlus,
    },
    {
      id: 'requests',
      label: 'Friend Requests',
      icon: UserCheck,
      badge: requestCount > 0 ? requestCount : undefined,
    },
    {
      id: 'friends',
      label: 'All Friends',
      icon: Users,
    },
  ]

  return (
    <div className='w-full md:w-90 shrink-0 bg-background md:border-r h-full flex flex-col'>
      <div className='p-4 pt-5 pb-2 flex items-center justify-between'>
        <h2 className='text-2xl font-bold tracking-tight'>Friends</h2>
        <Button
          variant='ghost'
          size='icon'
          className='rounded-full bg-muted/50 hover:bg-muted cursor-pointer'
          type='button'
        >
          <Settings className='w-5 h-5 text-foreground' />
        </Button>
      </div>

      <div className='px-2 pb-2'>
        <nav className='space-y-0.5'>
          {navItems.map(item => {
            const isActive = activeView === item.id
            return (
              <button
                type='button'
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors font-medium relative',
                  isActive
                    ? 'bg-muted/80 text-foreground'
                    : 'hover:bg-muted/50 text-foreground/80 hover:text-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <item.icon className='w-5 h-5' />
                </div>
                <span className='flex-1 text-left text-[17px]'>
                  {item.label}
                </span>
                {item.badge && (
                  <div className='flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full ml-auto'>
                    {item.badge}
                  </div>
                )}
                {isActive && <div className='hidden' />}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
