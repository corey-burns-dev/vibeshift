import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useCreatePost, usePost, usePosts } from '@/hooks/usePosts'
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
})
