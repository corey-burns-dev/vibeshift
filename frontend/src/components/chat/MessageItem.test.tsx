import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageItem } from '@/components/chat/MessageItem'
import { buildMessage, buildUser } from '@/test/test-utils'

vi.mock('@/components/UserMenu', () => ({
  UserMenu: ({
    children,
    user,
  }: {
    children: React.ReactNode
    user: { id: number }
  }) => <div data-testid={`user-menu-${user.id}`}>{children}</div>,
}))

describe('MessageItem', () => {
  it('renders message content', () => {
    const message = buildMessage({
      content: 'Hello world',
      sender: buildUser({ id: 1, username: 'alice' }),
    })

    render(<MessageItem message={message} isOwnMessage={false} />)

    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows "You" for own message', () => {
    const message = buildMessage({
      content: 'My message',
      sender: buildUser({ id: 1, username: 'me' }),
    })

    render(<MessageItem message={message} isOwnMessage={true} />)

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('My message')).toBeInTheDocument()
  })

  it('shows sender username for other user message', () => {
    const message = buildMessage({
      content: 'Other message',
      sender: buildUser({ id: 2, username: 'bob' }),
    })

    render(<MessageItem message={message} isOwnMessage={false} />)

    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('Other message')).toBeInTheDocument()
  })

  it('shows Unknown when sender is missing', () => {
    const message = buildMessage({
      content: 'System message',
      sender: undefined,
    })

    render(<MessageItem message={message} isOwnMessage={false} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
