import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Posts from '@/pages/Posts'
import { createTestQueryClient } from '@/test/test-utils'

const sanctums = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  name: `Sanctum ${i + 1}`,
  slug: `sanctum-${i + 1}`,
  description: `Description ${i + 1}`,
}))

vi.mock('@/hooks/usePosts', () => ({
  sortPostsNewestFirst: (posts: unknown[]) => posts,
  useInfinitePosts: () => ({
    data: { pages: [[]] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
  useMembershipFeedPosts: () => ({
    memberships: sanctums.slice(0, 4).map(sanctum => ({
      sanctum_id: sanctum.id,
      role: 'member',
      sanctum,
    })),
    posts: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    hasMore: false,
  }),
  useCreatePost: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useLikePost: () => ({
    mutate: vi.fn(),
  }),
  useDeletePost: () => ({
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: () => ({ data: sanctums }),
}))

vi.mock('@/hooks/useUsers', () => ({
  getCurrentUser: () => ({
    id: 11,
    username: 'tester',
    email: 'tester@example.com',
  }),
  useIsAuthenticated: () => true,
}))

vi.mock('@/hooks/usePresence', () => ({
  usePresenceStore: (
    selector: (state: { onlineUserIds: Set<number> }) => Set<number>
  ) => selector({ onlineUserIds: new Set<number>() }),
}))

vi.mock('@/hooks/useModeration', () => ({
  useReportPost: () => ({
    mutate: vi.fn(),
  }),
}))

describe('Posts sidebar sanctum links', () => {
  it('renders joined sanctums only and highlights active sanctum', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Posts sanctumId={1} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const container = screen.getByTestId('posts-sidebar-sanctum-links')
    const sanctumLinks = within(container).getAllByRole('link')

    expect(sanctumLinks).toHaveLength(4)
    expect(
      within(container).queryByRole('link', { name: 'Sanctum 5' })
    ).toBeNull()
    expect(
      within(container).getByRole('link', { name: 'Sanctum 1' })
    ).toHaveAttribute('href', '/s/sanctum-1')
    expect(
      within(container).getByRole('link', { name: 'Sanctum 1' })
    ).toHaveAttribute('aria-current', 'page')
  })
})
