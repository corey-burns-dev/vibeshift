import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FriendCard } from '@/components/friends/FriendCard'
import { buildUser } from '@/test/test-utils'

describe('FriendCard', () => {
  const user = buildUser({
    id: 1,
    username: 'alice',
    bio: 'Hello world',
  })

  it('renders user username and bio', () => {
    render(
      <MemoryRouter>
        <FriendCard user={user} actionType='remove' onAction={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows Suggested for you when bio is empty', () => {
    render(
      <MemoryRouter>
        <FriendCard
          user={buildUser({ id: 2, username: 'bob' })}
          actionType='add'
          onAction={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Suggested for you')).toBeInTheDocument()
  })

  it('calls onAction when remove button clicked', async () => {
    const onAction = vi.fn()
    render(
      <MemoryRouter>
        <FriendCard user={user} actionType='remove' onAction={onAction} />
      </MemoryRouter>
    )

    const userEventInstance = userEvent.setup()
    await userEventInstance.click(
      screen.getByRole('button', { name: 'Remove Friend' })
    )
    expect(onAction).toHaveBeenCalledWith('remove', user)
  })

  it('shows accept and reject when actionType is accept_reject', () => {
    render(
      <MemoryRouter>
        <FriendCard user={user} actionType='accept_reject' onAction={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
