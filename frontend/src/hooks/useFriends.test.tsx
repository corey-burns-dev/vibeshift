import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import {
  useAcceptFriendRequest,
  useFriends,
  useFriendshipStatus,
  usePendingRequests,
  useRejectFriendRequest,
  useRemoveFriend,
  useSendFriendRequest,
  useSentRequests,
} from '@/hooks/useFriends'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getFriends: vi.fn(),
    getPendingRequests: vi.fn(),
    getSentRequests: vi.fn(),
    getFriendshipStatus: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    removeFriend: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useFriends hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useFriends', () => {
    it('fetches friends list', async () => {
      const friends = [
        {
          id: 1,
          username: 'alice',
          email: 'alice@example.com',
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getFriends.mockResolvedValue(friends as never)

      const { result } = renderHook(() => useFriends(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(friends)
    })
  })

  describe('usePendingRequests', () => {
    it('fetches incoming friend requests', async () => {
      const requests = [
        {
          id: 1,
          sender_id: 2,
          receiver_id: 1,
          status: 'pending' as const,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getPendingRequests.mockResolvedValue(
        requests as never
      )

      const { result } = renderHook(() => usePendingRequests(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(requests)
    })
  })

  describe('useSentRequests', () => {
    it('fetches outgoing friend requests', async () => {
      const requests = [
        {
          id: 1,
          sender_id: 1,
          receiver_id: 2,
          status: 'pending' as const,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getSentRequests.mockResolvedValue(requests as never)

      const { result } = renderHook(() => useSentRequests(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(requests)
    })
  })

  describe('useFriendshipStatus', () => {
    it('fetches status when userId is set', async () => {
      vi.mocked(apiClient).getFriendshipStatus.mockResolvedValue({
        status: 'friends',
      } as never)

      const { result } = renderHook(() => useFriendshipStatus(5), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual({ status: 'friends' })
      expect(vi.mocked(apiClient).getFriendshipStatus).toHaveBeenCalledWith(5)
    })

    it('does not fetch when userId is 0', () => {
      const { result } = renderHook(() => useFriendshipStatus(0), {
        wrapper: createWrapper(),
      })
      expect(result.current.isFetching).toBe(false)
      expect(vi.mocked(apiClient).getFriendshipStatus).not.toHaveBeenCalled()
    })
  })

  describe('useSendFriendRequest', () => {
    it('calls API with userId', async () => {
      vi.mocked(apiClient).sendFriendRequest.mockResolvedValue(
        undefined as never
      )

      const { result } = renderHook(() => useSendFriendRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(10)
      })

      expect(vi.mocked(apiClient).sendFriendRequest).toHaveBeenCalledWith(10)
    })
  })

  describe('useAcceptFriendRequest', () => {
    it('calls API with requestId', async () => {
      vi.mocked(apiClient).acceptFriendRequest.mockResolvedValue(
        undefined as never
      )

      const { result } = renderHook(() => useAcceptFriendRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(3)
      })

      expect(vi.mocked(apiClient).acceptFriendRequest).toHaveBeenCalledWith(3)
    })
  })

  describe('useRejectFriendRequest', () => {
    it('calls API with requestId', async () => {
      vi.mocked(apiClient).rejectFriendRequest.mockResolvedValue(
        undefined as never
      )

      const { result } = renderHook(() => useRejectFriendRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(3)
      })

      expect(vi.mocked(apiClient).rejectFriendRequest).toHaveBeenCalledWith(3)
    })
  })

  describe('useRemoveFriend', () => {
    it('calls API with userId', async () => {
      vi.mocked(apiClient).removeFriend.mockResolvedValue(undefined as never)

      const { result } = renderHook(() => useRemoveFriend(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(7)
      })

      expect(vi.mocked(apiClient).removeFriend).toHaveBeenCalledWith(7)
    })
  })
})
