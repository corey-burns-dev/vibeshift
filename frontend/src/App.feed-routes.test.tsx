import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { createTestQueryClient } from '@/test/test-utils'

const mockUseIsAuthenticated = vi.fn(() => true)

vi.mock('@/hooks', () => ({
  useIsAuthenticated: () => mockUseIsAuthenticated(),
}))

vi.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/providers/ChatProvider', () => ({
  ChatProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/hooks/useRealtimeNotifications', () => ({
  useRealtimeNotifications: vi.fn(),
}))

vi.mock('@/components/MobileHeader', () => ({
  MobileHeader: () => null,
}))

vi.mock('@/components/TopBar', () => ({
  TopBar: () => null,
}))

vi.mock('@/components/BottomBar', () => ({
  BottomBar: () => null,
}))

vi.mock('@/components/chat/ChatDock', () => ({
  ChatDock: () => null,
}))

vi.mock('@/utils/prefetch', () => ({
  routePrefetchMap: {},
}))

vi.mock('@/pages/Posts', () => ({
  default: ({ mode }: { mode?: string }) => <div>Posts mode: {mode}</div>,
}))

describe('feed routes', () => {
  beforeEach(() => {
    mockUseIsAuthenticated.mockReturnValue(true)
  })

  it('renders / with all-feed mode for authenticated users', async () => {
    window.history.pushState({}, '', '/')

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Posts mode: all')).toBeInTheDocument()
  })

  it('renders /feed with membership-feed mode', async () => {
    window.history.pushState({}, '', '/feed')

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>
    )

    expect(
      await screen.findByText('Posts mode: membership')
    ).toBeInTheDocument()
  })
})
