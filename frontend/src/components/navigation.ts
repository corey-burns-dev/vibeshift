import type { LucideIcon } from 'lucide-react'
import {
  Gamepad2,
  Home,
  Landmark,
  MessageCircle,
  MessageSquare,
  Radio,
  Users,
  Video,
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
  { icon: MessageCircle, label: 'Messages', path: '/messages' },
  { icon: MessageSquare, label: 'Chatrooms', path: '/chat' },
]

export const topServiceNav: NavItem[] = [
  { icon: Landmark, label: 'Sanctums', path: '/sanctums' },
  { icon: Users, label: 'Friends', path: '/friends' },
  { icon: Gamepad2, label: 'Games', path: '/games' },
  { icon: Radio, label: 'Streams', path: '/streams' },
  { icon: Video, label: 'Video', path: '/videochat' },
]

export const sideNavSections: NavSection[] = [
  { title: 'Routes', items: topRouteNav },
  { title: 'Services', items: topServiceNav },
]

export const mobileNav: NavItem[] = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: MessageCircle, label: 'Messages', path: '/messages' },
  { icon: Gamepad2, label: 'Games', path: '/games' },
  { icon: MessageSquare, label: 'Chatrooms', path: '/chat' },
]

const routeTitles: Array<{ path: string; title: string }> = [
  { path: '/videochat', title: 'Video Chat' },
  { path: '/messages', title: 'Messages' },
  { path: '/chat', title: 'Chatrooms' },
  { path: '/admin/sanctum-requests', title: 'Sanctum Requests (Admin)' },
  { path: '/sanctums/requests', title: 'My Sanctum Requests' },
  { path: '/sanctums/request', title: 'Request Sanctum' },
  { path: '/sanctums', title: 'Sanctums' },
  { path: '/s', title: 'Sanctum' },
  { path: '/friends', title: 'Friends' },
  { path: '/streams', title: 'Streams' },
  { path: '/games', title: 'Games' },
  { path: '/users', title: 'People' },
  { path: '/profile', title: 'Profile' },
  { path: '/posts', title: 'Feed' },
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
