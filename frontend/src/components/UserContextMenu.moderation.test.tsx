import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserContextMenu } from '@/components/UserContextMenu'
import { useUserActions } from '@/hooks/useUserActions'

vi.mock('@/hooks/useUserActions', () => ({
  useUserActions: vi.fn(),
}))

describe('UserContextMenu moderation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserActions).mockReturnValue({
      isSelf: false,
      handleViewProfile: vi.fn(),
      handleMessage: vi.fn(),
      handleJoinConnect4: vi.fn(),
      handleAddFriend: vi.fn(),
      handleRemoveFriend: vi.fn(),
      canAddFriend: true,
      addFriendDisabled: false,
      addFriendLabel: 'Add Friend',
      isFriend: false,
      removeFriendPending: false,
      isBlocked: false,
      toggleBlockUser: vi.fn(),
      handleReportUser: vi.fn(),
      blockPending: false,
      targetOnline: true,
      status: 'none',
    } as never)
  })

  it('renders and executes moderation actions when capabilities are provided', () => {
    const onKick = vi.fn()
    const onTimeout = vi.fn()
    const onToggleBan = vi.fn()
    const onToggleModerator = vi.fn()

    render(
      <MemoryRouter>
        <UserContextMenu
          user={{
            id: 2,
            username: 'friend',
            email: 'friend@example.com',
            created_at: '',
            updated_at: '',
          }}
          moderationActions={{
            canModerate: true,
            canManageModerators: true,
            onKick,
            onTimeout,
            onToggleBan,
            onToggleModerator,
          }}
        >
          <button type='button'>Open Menu</button>
        </UserContextMenu>
      </MemoryRouter>
    )

    const trigger = screen.getByRole('button', { name: 'Open Menu' })
    fireEvent.contextMenu(trigger)
    fireEvent.click(screen.getByText('Kick from room'))
    fireEvent.contextMenu(trigger)
    fireEvent.click(screen.getByText('Timeout User'))
    fireEvent.contextMenu(trigger)
    fireEvent.click(screen.getByText('Ban from Room'))
    fireEvent.contextMenu(trigger)
    fireEvent.click(screen.getByText('Promote to Room Moderator'))

    expect(onKick).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onToggleBan).toHaveBeenCalledTimes(1)
    expect(onToggleModerator).toHaveBeenCalledTimes(1)
  })

  it('hides moderation actions when not provided', () => {
    render(
      <MemoryRouter>
        <UserContextMenu
          user={{
            id: 2,
            username: 'friend',
            email: 'friend@example.com',
            created_at: '',
            updated_at: '',
          }}
        >
          <button type='button'>Open Menu</button>
        </UserContextMenu>
      </MemoryRouter>
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Menu' }))
    expect(screen.queryByText('Kick from room')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Promote to Room Moderator')
    ).not.toBeInTheDocument()
  })

  it('disables connect 4 invite when target user is offline', () => {
    vi.mocked(useUserActions).mockReturnValue({
      isSelf: false,
      handleViewProfile: vi.fn(),
      handleMessage: vi.fn(),
      handleJoinConnect4: vi.fn(),
      handleAddFriend: vi.fn(),
      handleRemoveFriend: vi.fn(),
      canAddFriend: true,
      addFriendDisabled: false,
      addFriendLabel: 'Add Friend',
      isFriend: false,
      removeFriendPending: false,
      isBlocked: false,
      toggleBlockUser: vi.fn(),
      handleReportUser: vi.fn(),
      blockPending: false,
      targetOnline: false,
      status: 'none',
    } as never)

    render(
      <MemoryRouter>
        <UserContextMenu
          user={{
            id: 2,
            username: 'friend',
            email: 'friend@example.com',
            created_at: '',
            updated_at: '',
          }}
        >
          <button type='button'>Open Menu</button>
        </UserContextMenu>
      </MemoryRouter>
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Menu' }))
    const connect4Item = screen.getByText('Connect 4 (Offline)').closest('[role="menuitem"]')
    expect(connect4Item).toHaveAttribute('data-disabled')
  })
})
