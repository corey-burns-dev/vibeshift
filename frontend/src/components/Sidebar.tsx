import {
    Compass,
    Gamepad2,
    Home,
    LogOut,
    Menu,
    MessageCircle,
    MessageSquare,
    Radio,
    Search,
    Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getCurrentUser, useIsAuthenticated, useLogout, useStreams } from '@/hooks'
import { cn } from '@/lib/utils'

export function Sidebar() {
    const location = useLocation()
    const isAuthenticated = useIsAuthenticated()
    const currentUser = getCurrentUser()
    const logout = useLogout()
    const [isHovered, setIsHovered] = useState(false)

    const menuItems = [
        { icon: Home, label: 'Home', path: '/' },
        { icon: Search, label: 'Search', path: '/users' },
        { icon: Compass, label: 'Explore', path: '/posts' },
        { icon: Radio, label: 'Streams', path: '/streams' },
        { icon: MessageSquare, label: 'Chatrooms', path: '/chat' },
        { icon: MessageCircle, label: 'Messages', path: '/messages' },
        { icon: Users, label: 'Friends', path: '/friends' },
        { icon: Gamepad2, label: 'Games', path: '/games' },
    ]

    const { data: streamsData } = useStreams()
    const liveStreams = streamsData?.streams.filter((s) => s.is_live).slice(0, 5) || []

    if (!isAuthenticated) return null

    return (
        <nav
            className={cn(
                'relative h-full min-h-screen w-16 border-r bg-background flex flex-col transition-all duration-300 z-40 group/sidebar shrink-0',
                isHovered && 'w-64 shadow-xl'
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Logo */}
            <div className="px-4 py-6 mb-4 overflow-hidden">
                <Link to="/" className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold shrink-0 shadow-lg">
                        V
                    </div>
                    <span
                        className={cn(
                            'text-xl font-bold transition-all duration-300 whitespace-nowrap',
                            isHovered ? 'opacity-100 w-auto' : 'opacity-0 w-0'
                        )}
                    >
                        Vibeshift
                    </span>
                </Link>
            </div>

            <div className="flex-1 px-2 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                'flex items-center p-3 rounded-lg transition-all duration-200 group/item',
                                isActive
                                    ? 'bg-secondary text-foreground font-semibold'
                                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                            )}
                        >
                            <item.icon
                                className={cn(
                                    'w-6 h-6 shrink-0 transition-transform duration-200 group-hover/item:scale-110',
                                    isActive && 'text-primary'
                                )}
                            />
                            <span
                                className={cn(
                                    'transition-all duration-300 overflow-hidden whitespace-nowrap',
                                    isHovered ? 'w-auto opacity-100 ml-4' : 'w-0 opacity-0 ml-0'
                                )}
                            >
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
            </div>

            {/* Live Channels */}
            {liveStreams.length > 0 && (
                <div className="px-2 py-2 border-t">
                    <h3
                        className={cn(
                            'px-4 text-xs font-semibold text-muted-foreground mb-2 transition-all duration-300',
                            isHovered ? 'opacity-100' : 'opacity-0'
                        )}
                    >
                        LIVE CHANNELS
                    </h3>
                    <div className="space-y-1">
                        {liveStreams.map((stream) => (
                            <Link
                                key={stream.id}
                                to={`/streams/${stream.id}`}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-all duration-200 group/channel"
                            >
                                <div className="relative shrink-0">
                                    <Avatar className="w-8 h-8 border">
                                        <AvatarImage src={stream.user?.avatar} />
                                        <AvatarFallback>
                                            {stream.user?.username?.[0]?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-background rounded-full animate-pulse" />
                                </div>
                                <div
                                    className={cn(
                                        'flex flex-col min-w-0 transition-all duration-300 overflow-hidden',
                                        isHovered ? 'w-auto opacity-100 ml-1' : 'w-0 opacity-0 ml-0'
                                    )}
                                >
                                    <span className="text-sm font-semibold truncate">
                                        {stream.title}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                        {stream.category || 'Variety'} • {stream.viewer_count}{' '}
                                        viewers
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="p-2 border-t">
                <div className="flex items-center p-2 rounded-lg hover:bg-secondary/50 transition-all duration-300">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex items-center gap-3 w-full outline-hidden bg-transparent border-none p-0 cursor-pointer text-left"
                            >
                                <Avatar className="w-8 h-8 shrink-0 border">
                                    <AvatarImage src={currentUser?.avatar} />
                                    <AvatarFallback>
                                        {currentUser?.username?.[0].toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div
                                    className={cn(
                                        'flex flex-col items-start transition-all duration-300 overflow-hidden whitespace-nowrap',
                                        isHovered ? 'w-auto opacity-100 ml-4' : 'w-0 opacity-0 ml-0'
                                    )}
                                >
                                    <span className="text-sm font-semibold truncate w-full">
                                        {currentUser?.username}
                                    </span>
                                </div>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="w-56"
                            side="right"
                            sideOffset={12}
                        >
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center">
                                        <Menu className="mr-2 h-4 w-4" />
                                        <span>Appearance</span>
                                    </div>
                                    <ModeToggle />
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => logout()}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </nav>
    )
}
