import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLikePost, usePost } from '@/hooks/usePosts'
import { useIsAuthenticated } from '@/hooks/useUsers'
import PostDetail from '@/pages/PostDetail'
import { renderWithProviders } from '@/test/test-utils'

type ReturnMock = {
  mockReturnValue: (value: unknown) => unknown
}

const asReturnMock = (fn: unknown): ReturnMock => fn as ReturnMock

vi.mock('@/hooks/usePosts', () => ({
  usePost: vi.fn(),
  useLikePost: vi.fn(),
}))

vi.mock('@/hooks/useUsers', () => ({
  useIsAuthenticated: vi.fn(),
  getCurrentUser: vi.fn(() => ({
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    created_at: '',
    updated_at: '',
  })),
}))

vi.mock('@/components/UserMenu', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test passthrough component
  UserMenu: ({ children }: any) => children,
}))

// Prevent accidental real network requests from PostComments by mocking
// the API client used to fetch comments for this test file.
vi.mock('@/api/client', () => ({
  apiClient: {
    getPostComments: vi.fn(() => Promise.resolve([])),
  },
}))

describe('PostDetail image URL normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asReturnMock(useIsAuthenticated).mockReturnValue(true)
    asReturnMock(useLikePost).mockReturnValue({
      mutate: vi.fn(),
    } as never)
    // Stub global fetch to prevent accidental real network requests
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      )
    )
  })

  it('renders legacy absolute image URLs as same-origin relative src', () => {
    asReturnMock(usePost).mockReturnValue({
      data: {
        id: 42,
        title: 'Legacy image post',
        content: '',
        image_url: 'http://localhost:8375/api/images/hash42',
        likes_count: 0,
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
      isLoading: false,
      isError: false,
    } as never)

    renderWithProviders(
      <Routes>
        <Route path='/posts/:id' element={<PostDetail />} />
      </Routes>,
      { route: '/posts/42' }
    )

    const image = screen.getByAltText('Post by alice')
    expect(image).toHaveAttribute('src', '/api/images/hash42')
  })
})
