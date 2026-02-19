import type { LucideIcon } from 'lucide-react'
import {
  Gamepad2,
  Home,
  Landmark,
  MessageSquare,
  PenSquare,
  Rss,
  Users,
} from 'lucide-react'

export interface NavItem {
  icon: LucideIcon
  label: string
  path: string
  hint?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const topRouteNav: NavItem[] = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Rss, label: 'Feed', path: '/feed' },
  { icon: MessageSquare, label: 'Chat', path: '/chat' },
]

export const topServiceNav: NavItem[] = [
  { icon: Landmark, label: 'Sanctums', path: '/sanctums' },
  { icon: PenSquare, label: 'Create', path: '/submit' },
  { icon: Users, label: 'Friends', path: '/friends' },
  { icon: Gamepad2, label: 'Games', path: '/games' },
]

export const sideNavSections: NavSection[] = [
  { title: 'Routes', items: topRouteNav },
  { title: 'Services', items: topServiceNav },
]

export const mobileNav: NavItem[] = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Rss, label: 'Feed', path: '/feed' },
  { icon: MessageSquare, label: 'Chat', path: '/chat' },
  { icon: Gamepad2, label: 'Games', path: '/games' },
]

const routeTitles: Array<{ path: string; title: string }> = [
  { path: '/chat', title: 'Chat' },
  { path: '/admin', title: 'Admin Console' },
  { path: '/sanctums/requests', title: 'My Sanctum Requests' },
  { path: '/sanctums/request', title: 'Request Sanctum' },
  { path: '/sanctums', title: 'Sanctums' },
  { path: '/s', title: 'Sanctum' },
  { path: '/friends', title: 'Friends' },

  { path: '/games', title: 'Games' },
  { path: '/users', title: 'People' },
  { path: '/profile', title: 'Profile' },
  { path: '/submit', title: 'Create Post' },
  { path: '/feed', title: 'Feed' },
  { path: '/posts', title: 'Home' },
  { path: '/signup', title: 'Create Account' },
  { path: '/login', title: 'Login' },
  { path: '/', title: 'Home' },
]

export function isRouteActive(pathname: string, path: string): boolean {
  if (path === '/') {
    return pathname === '/'
  }

  return pathname === path || pathname.startsWith(`${path}/`)
}

export function getRouteTitle(pathname: string): string {
  const matched = routeTitles.find(route => isRouteActive(pathname, route.path))
  return matched?.title ?? 'Workspace'
}
