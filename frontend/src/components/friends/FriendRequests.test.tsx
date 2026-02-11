import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FriendRequestList } from '@/components/friends/FriendRequests'
import {
  usePendingRequests as usePendingRequestsHook,
  useSentRequests as useSentRequestsHook,
} from '@/hooks/useFriends'
import {
  buildFriendRequest,
  buildUser,
  createTestQueryClient,
} from '@/test/test-utils'

vi.mock('@/hooks/useFriends', () => ({
  usePendingRequests: vi.fn(),
  useSentRequests: vi.fn(),
  useAcceptFriendRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectFriendRequest: () => ({ mutate: vi.fn(), isPending: false }),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('FriendRequestList', () => {
  it('shows loading state', () => {
    vi.mocked(usePendingRequestsHook).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never)
    vi.mocked(useSentRequestsHook).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)

    renderWithProviders(<FriendRequestList />)
    expect(screen.getByText('Loading requests...')).toBeInTheDocument()
  })

  it('shows empty state when no requests', () => {
    vi.mocked(usePendingRequestsHook).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)
    vi.mocked(useSentRequestsHook).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)

    renderWithProviders(<FriendRequestList />)
    expect(
      screen.getByText('No pending or sent friend requests.')
    ).toBeInTheDocument()
  })

  it('renders incoming requests with Accept and Decline', () => {
    const incoming = [
      buildFriendRequest({
        id: 1,
        sender_id: 2,
        sender: buildUser({ id: 2, username: 'bob' }),
      }),
    ]
    vi.mocked(usePendingRequestsHook).mockReturnValue({
      data: incoming,
      isLoading: false,
    } as never)
    vi.mocked(useSentRequestsHook).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)

    renderWithProviders(<FriendRequestList />)
    expect(screen.getByText('Incoming Requests')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Decline/ })).toBeInTheDocument()
  })
})
