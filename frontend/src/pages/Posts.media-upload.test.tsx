import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import {
  useCreatePost,
  useDeletePost,
  useInfinitePosts,
  useLikePost,
  useMembershipFeedPosts,
} from '@/hooks/usePosts'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import Posts from '@/pages/Posts'
import { renderWithProviders } from '@/test/test-utils'

type ReturnMock = {
  mockReturnValue: (value: unknown) => unknown
}

const asReturnMock = (fn: unknown): ReturnMock => fn as ReturnMock

vi.mock('@/api/client', () => ({
  apiClient: {
    uploadImage: vi.fn(),
    updatePost: vi.fn(),
  },
}))

vi.mock('@/hooks/usePosts', () => ({
  sortPostsNewestFirst: (posts: unknown[]) => posts,
  useInfinitePosts: vi.fn(),
  useCreatePost: vi.fn(),
  useLikePost: vi.fn(),
  useDeletePost: vi.fn(),
  useMembershipFeedPosts: vi.fn(),
}))

vi.mock('@/hooks/useUsers', () => ({
  useIsAuthenticated: vi.fn(),
  getCurrentUser: vi.fn(),
}))

describe('Posts media upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    })

    asReturnMock(useIsAuthenticated).mockReturnValue(true)
    asReturnMock(getCurrentUser).mockReturnValue({
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      created_at: '',
      updated_at: '',
    })
    asReturnMock(useInfinitePosts).mockReturnValue({
      data: { pages: [[]] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    } as never)
    asReturnMock(useLikePost).mockReturnValue({
      mutate: vi.fn(),
    } as never)
    asReturnMock(useMembershipFeedPosts).mockReturnValue({
      memberships: [],
      posts: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      hasMore: false,
    } as never)
    asReturnMock(useCreatePost).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as never)
    asReturnMock(useDeletePost).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('uploads image first, then creates media post with returned image_url', async () => {
    let resolveUpload!: (v: {
      id: number
      hash: string
      url: string
      thumbnail_url: string
      medium_url: string
      width: number
      height: number
      size_bytes: number
      mime_type: string
    }) => void
    const uploadPromise = new Promise<{
      id: number
      hash: string
      url: string
      thumbnail_url: string
      medium_url: string
      width: number
      height: number
      size_bytes: number
      mime_type: string
    }>(resolve => {
      resolveUpload = resolve
    })
    asReturnMock(apiClient.uploadImage).mockReturnValue(uploadPromise as never)

    const mutateAsync = vi.fn().mockResolvedValue({
      id: 99,
      title: 'My image post',
      content: '',
      post_type: 'media',
      image_url: 'http://localhost:8375/api/images/hash123',
      likes_count: 0,
      user_id: 1,
      created_at: '',
      updated_at: '',
    })
    asReturnMock(useCreatePost).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)

    const { container } = renderWithProviders(<Posts />)

    fireEvent.click(screen.getByText(/what's on your mind, alice\?/i))
    fireEvent.click(screen.getByRole('button', { name: 'Media' }))

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null
    expect(fileInput).not.toBeNull()
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', {
      type: 'image/png',
    })
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() =>
      expect(apiClient.uploadImage).toHaveBeenCalledWith(file)
    )
    expect(mutateAsync).not.toHaveBeenCalled()

    resolveUpload({
      id: 7,
      hash: 'hash123',
      url: 'http://localhost:8375/api/images/hash123',
      thumbnail_url: 'http://localhost:8375/api/images/hash123?size=thumbnail',
      medium_url: 'http://localhost:8375/api/images/hash123?size=medium',
      width: 10,
      height: 10,
      size_bytes: 123,
      mime_type: 'image/png',
    })

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'alice',
          post_type: 'media',
          image_url: '/api/images/hash123',
        })
      )
    })
  })

  it('renders legacy absolute image URLs as same-origin relative src', () => {
    asReturnMock(useInfinitePosts).mockReturnValue({
      data: {
        pages: [
          [
            {
              id: 123,
              title: 'Legacy media',
              content: '',
              image_url: 'http://localhost:8375/api/images/hash999',
              likes_count: 0,
              comments_count: 0,
              user_id: 1,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              user: {
                id: 1,
                username: 'alice',
                email: 'alice@example.com',
                created_at: '',
                updated_at: '',
              },
            },
          ],
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    } as never)

    renderWithProviders(<Posts />)

    const image = screen.getByAltText('Post by alice')
    expect(image).toHaveAttribute('src', '/api/images/hash999')
  })
})
