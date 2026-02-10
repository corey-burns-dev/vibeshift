import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useSignup } from '@/hooks/useAuth'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  )
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/client', () => ({
  apiClient: {
    signup: vi.fn(),
    login: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSignup onboarding behavior', () => {
  beforeAll(() => {
    const store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          Object.keys(store).forEach(key => delete store[key])
        },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage?.removeItem?.('token')
    localStorage?.removeItem?.('user')
  })

  it('redirects to /posts after successful signup (onboarding pending backend follow/join API)', async () => {
    vi.mocked(apiClient.signup).mockResolvedValue({
      token: 'token-123',
      user: {
        id: 1,
        username: 'tester',
        email: 'tester@example.com',
        is_admin: false,
      },
    })

    const { result } = renderHook(() => useSignup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        username: 'tester',
        email: 'tester@example.com',
        password: 'Password123!',
      })
    })

    expect(localStorage.getItem('token')).toBe('token-123')
    expect(navigateMock).toHaveBeenCalledWith('/posts')
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding/sanctums')
  })
})
