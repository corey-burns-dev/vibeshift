import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { apiClient } from '@/api/client'
import {
  clearCachedUser,
  getCurrentUser,
  useAllUsers,
  useUserProfile,
  useValidateToken,
} from '@/hooks/useUsers'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status?: number
    constructor(message: string, status?: number) {
      super(message)
      this.status = status
    }
  },
  apiClient: {
    getUsers: vi.fn(),
    getUserProfile: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useUsers hooks', () => {
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
          for (const k of Object.keys(store)) delete store[k]
        },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clear()
    clearCachedUser()
  })

  afterEach(() => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    useAuthSessionStore.getState().clear()
    clearCachedUser()
  })

  describe('getCurrentUser', () => {
    it('returns parsed user from localStorage', () => {
      const user = { id: 1, username: 'u', email: 'u@x.com' }
      localStorage.setItem('user', JSON.stringify(user))
      expect(getCurrentUser()).toEqual(user)
    })

    it('returns updated user when localStorage changes between sessions', () => {
      const userA = { id: 1, username: 'user-a', email: 'a@example.com' }
      const userB = { id: 2, username: 'user-b', email: 'b@example.com' }

      localStorage.setItem('user', JSON.stringify(userA))
      expect(getCurrentUser()).toEqual(userA)

      localStorage.setItem('user', JSON.stringify(userB))
      expect(getCurrentUser()).toEqual(userB)
    })

    it('returns null when no user in localStorage', () => {
      expect(getCurrentUser()).toBeNull()
    })

    it('returns null when localStorage has invalid JSON', () => {
      localStorage.setItem('user', 'invalid')
      expect(getCurrentUser()).toBeNull()
    })
  })

  describe('useAllUsers', () => {
    it('fetches users list', async () => {
      const users = [
        {
          id: 1,
          username: 'alice',
          email: 'alice@example.com',
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getUsers.mockResolvedValue(users as never)

      const { result } = renderHook(() => useAllUsers(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(users)
    })
  })

  describe('useUserProfile', () => {
    it('fetches user profile by id', async () => {
      const user = {
        id: 5,
        username: 'bob',
        email: 'bob@example.com',
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).getUserProfile.mockResolvedValue(user as never)

      const { result } = renderHook(() => useUserProfile(5), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(user)
      expect(vi.mocked(apiClient).getUserProfile).toHaveBeenCalledWith(5)
    })
  })

  describe('useValidateToken', () => {
    it('returns true when authenticated endpoint succeeds', async () => {
      useAuthSessionStore.getState().setAccessToken('some-token')
      vi.mocked(apiClient).getCurrentUser.mockResolvedValue({} as never)

      const { result } = renderHook(() => useValidateToken(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBe(true)
      expect(vi.mocked(apiClient).getCurrentUser).toHaveBeenCalled()
    })
  })
})
