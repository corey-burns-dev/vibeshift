import { LogOut, Settings, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { topRouteNav, topServiceNav } from '@/components/navigation'
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
import { getInitials } from '@/lib/chat-utils'

const navLinks = [...topRouteNav, ...topServiceNav]

export function Navbar() {
  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const logout = useLogout()

  return (
    <nav className='border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60'>
      <div className='max-w-6xl mx-auto px-4 py-4 flex items-center justify-between'>
        <div className='flex items-center gap-8'>
          <Link to='/' className='text-2xl font-bold text-primary'>
            Sanctum
          </Link>
          <div className='hidden md:flex gap-6'>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className='text-muted-foreground hover:text-foreground transition-colors'
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-4'>
          {isAuthenticated && currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  className='relative h-10 w-10 rounded-full'
                >
                  <Avatar className='h-10 w-10'>
                    <AvatarImage
                      src={currentUser.avatar}
                      alt={currentUser.username}
                    />
                    <AvatarFallback>
                      {getInitials(currentUser.username)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56' align='end' forceMount>
                <DropdownMenuLabel className='font-normal'>
                  <div className='flex flex-col space-y-1'>
                    <p className='text-sm font-medium leading-none'>
                      {currentUser.username}
                    </p>
                    <p className='text-xs leading-none text-muted-foreground'>
                      {currentUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to='/profile' className='cursor-pointer'>
                    <User className='mr-2 h-4 w-4' />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to='/settings' className='cursor-pointer'>
                    <Settings className='mr-2 h-4 w-4' />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className='cursor-pointer text-red-600'
                >
                  <LogOut className='mr-2 h-4 w-4' />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className='hidden md:flex gap-2'>
              <Button variant='ghost' asChild>
                <Link to='/login'>Login</Link>
              </Button>
              <Button asChild>
                <Link to='/signup'>Sign Up</Link>
              </Button>
            </div>
          )}
          <ModeToggle />
        </div>
      </div>
    </nav>
  )
}
