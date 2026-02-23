import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import {
  sortPostsNewestFirst,
  useCreatePost,
  usePost,
  usePosts,
} from '@/hooks/usePosts'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getPosts: vi.fn(),
    getPost: vi.fn(),
    createPost: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('usePosts hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('usePosts', () => {
    it('fetches posts list', async () => {
      const posts = [
        {
          id: 1,
          title: 'First',
          content: 'Content',
          likes_count: 0,
          user_id: 1,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getPosts.mockResolvedValue(posts as never)

      const { result } = renderHook(() => usePosts(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(posts)
    })
  })

  describe('usePost', () => {
    it('fetches single post when id > 0', async () => {
      const post = {
        id: 1,
        title: 'Post',
        content: 'Body',
        likes_count: 0,
        user_id: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).getPost.mockResolvedValue(post as never)

      const { result } = renderHook(() => usePost(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(post)
    })

    it('does not fetch when id is 0', () => {
      const { result } = renderHook(() => usePost(0), {
        wrapper: createWrapper(),
      })
      expect(result.current.isFetching).toBe(false)
      expect(vi.mocked(apiClient).getPost).not.toHaveBeenCalled()
    })
  })

  describe('useCreatePost', () => {
    it('calls API with post data', async () => {
      const created = {
        id: 1,
        title: 'New',
        content: 'Body',
        likes_count: 0,
        user_id: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).createPost.mockResolvedValue(created as never)

      const { result } = renderHook(() => useCreatePost(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ title: 'New', content: 'Body' })
      })

      expect(vi.mocked(apiClient).createPost).toHaveBeenCalledWith({
        title: 'New',
        content: 'Body',
      })
    })
  })

  describe('sortPostsNewestFirst', () => {
    it('sorts posts by created_at descending with id tie-breaker', () => {
      const sorted = sortPostsNewestFirst([
        {
          id: 7,
          title: 'older',
          content: '',
          likes_count: 0,
          user_id: 1,
          created_at: '2026-02-13T12:00:00Z',
          updated_at: '',
        },
        {
          id: 9,
          title: 'same time higher id',
          content: '',
          likes_count: 0,
          user_id: 1,
          created_at: '2026-02-14T12:00:00Z',
          updated_at: '',
        },
        {
          id: 8,
          title: 'same time lower id',
          content: '',
          likes_count: 0,
          user_id: 1,
          created_at: '2026-02-14T12:00:00Z',
          updated_at: '',
        },
      ] as never)

      expect(sorted.map(post => post.id)).toEqual([9, 8, 7])
    })

    it('pushes invalid timestamps to the end', () => {
      const sorted = sortPostsNewestFirst([
        {
          id: 3,
          title: 'invalid',
          content: '',
          likes_count: 0,
          user_id: 1,
          created_at: 'not-a-date',
          updated_at: '',
        },
        {
          id: 4,
          title: 'valid',
          content: '',
          likes_count: 0,
          user_id: 1,
          created_at: '2026-02-20T12:00:00Z',
          updated_at: '',
        },
      ] as never)

      expect(sorted.map(post => post.id)).toEqual([4, 3])
    })
  })
})
