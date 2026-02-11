import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FriendList } from '@/components/friends/FriendList'
import { buildUser, createTestQueryClient } from '@/test/test-utils'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/hooks/useFriends', () => ({
  useFriends: vi.fn(),
  useRemoveFriend: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useChat', () => ({
  useCreateConversation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))
vi.mock('@/hooks/usePresence', () => ({
  usePresenceStore: () => new Set<number>(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useFriends as useFriendsHook } from '@/hooks/useFriends'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('FriendList', () => {
  it('shows loading state', () => {
    vi.mocked(useFriendsHook).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never)

    renderWithProviders(<FriendList />)
    expect(screen.getByText('Loading friends...')).toBeInTheDocument()
  })

  it('shows empty state with Find People button', async () => {
    vi.mocked(useFriendsHook).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)

    renderWithProviders(<FriendList />)
    expect(
      screen.getByText("You haven't added any friends yet.")
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Find People' }))
    expect(mockNavigate).toHaveBeenCalledWith('/friends?tab=find')
  })

  it('renders friend cards when friends exist', () => {
    const friends = [
      buildUser({ id: 1, username: 'alice' }),
      buildUser({ id: 2, username: 'bob' }),
    ]
    vi.mocked(useFriendsHook).mockReturnValue({
      data: friends,
      isLoading: false,
    } as never)

    renderWithProviders(<FriendList />)

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })
})
