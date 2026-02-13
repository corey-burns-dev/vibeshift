import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { getAuthToken, useLogin, useLogout, useSignup } from '@/hooks/useAuth'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/client', () => ({
  apiClient: {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn().mockImplementation(async () => {
      useAuthSessionStore.getState().clear()
      localStorage.removeItem('user')
    }),
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
          for (const key of Object.keys(store)) {
            delete store[key]
          }
        },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage?.removeItem?.('token')
    localStorage?.removeItem?.('user')
    useAuthSessionStore.getState().clear()
  })

  it('redirects to /onboarding/sanctums after successful signup', async () => {
    vi.mocked(apiClient.signup).mockImplementation(async () => {
      const t = new Date().toISOString()
      const data = {
        token: 'token-123',
        user: {
          id: 1,
          username: 'tester',
          email: 'tester@example.com',
          is_admin: false,
          created_at: t,
          updated_at: t,
        },
      }
      useAuthSessionStore.getState().setAccessToken(data.token)
      return data
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

    expect(getAuthToken()).toBe('token-123')
    expect(navigateMock).toHaveBeenCalledWith('/onboarding/sanctums')
  })
})

describe('useLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage?.removeItem?.('token')
    localStorage?.removeItem?.('user')
    useAuthSessionStore.getState().clear()
  })

  it('stores token and user then navigates to /posts on success', async () => {
    vi.mocked(apiClient.login).mockImplementation(async () => {
      const t = new Date().toISOString()
      const data = {
        token: 'login-token',
        user: {
          id: 2,
          username: 'logintest',
          email: 'login@example.com',
          is_admin: false,
          created_at: t,
          updated_at: t,
        },
      }
      useAuthSessionStore.getState().setAccessToken(data.token)
      return data
    })

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        email: 'login@example.com',
        password: 'Password123!',
      })
    })

    expect(getAuthToken()).toBe('login-token')
    expect(navigateMock).toHaveBeenCalledWith('/posts')
  })
})

describe('useLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().setAccessToken('some-token')
    localStorage?.setItem?.('user', JSON.stringify({ id: 1, username: 'u' }))
  })

  it('clears token and user and navigates to /login', async () => {
    const { result } = renderHook(() => useLogout(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current()
    })

    expect(getAuthToken()).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })
})

describe('getAuthToken', () => {
  it('returns token from store', () => {
    useAuthSessionStore.getState().setAccessToken('stored-token')
    expect(getAuthToken()).toBe('stored-token')
    useAuthSessionStore.getState().clear()
  })

  it('returns null when no token', () => {
    useAuthSessionStore.getState().clear()
    expect(getAuthToken()).toBeNull()
  })
})
