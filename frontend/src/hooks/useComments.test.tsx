import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useCreateComment, usePostComments } from '@/hooks/useComments'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getPostComments: vi.fn(),
    createComment: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useComments hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('usePostComments', () => {
    it('fetches comments for post', async () => {
      const comments = [
        {
          id: 1,
          content: 'A comment',
          post_id: 1,
          user_id: 1,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getPostComments.mockResolvedValue(comments as never)

      const { result } = renderHook(() => usePostComments(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(comments)
    })
  })

  describe('useCreateComment', () => {
    it('calls API with post id and content', async () => {
      const created = {
        id: 1,
        content: 'New comment',
        post_id: 1,
        user_id: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).createComment.mockResolvedValue(created as never)

      const { result } = renderHook(() => useCreateComment(5), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ content: 'New comment' })
      })

      expect(vi.mocked(apiClient).createComment).toHaveBeenCalledWith(5, {
        content: 'New comment',
      })
    })
  })
})
