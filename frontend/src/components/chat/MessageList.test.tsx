import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from '@/components/chat/MessageList'

// Mock UserMenu since it uses navigation and other hooks
vi.mock('@/components/UserMenu', () => ({
  UserMenu: ({
    children,
    user,
  }: {
    children: React.ReactNode
    user: { id: number | string }
  }) => <div data-testid={`user-menu-${user.id}`}>{children}</div>,
}))

const createWrapper = () => {
  const queryClient = new QueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('MessageList', () => {
  it('renders loading state', () => {
    render(<MessageList messages={[]} isLoading={true} />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByText('Loading messages...')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(<MessageList messages={[]} isLoading={false} />, {
      wrapper: createWrapper(),
    })
    expect(
      screen.getByText('No messages yet. Start the conversation!')
    ).toBeInTheDocument()
  })

  it('renders messages correctly', () => {
    const messages = [
      {
        id: 1,
        content: 'Hello world',
        sender_id: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_id: 1,
        is_read: true,
        message_type: 'text' as const,
        sender: {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      {
        id: 2,
        content: 'Hi there',
        sender_id: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_id: 1,
        is_read: true,
        message_type: 'text' as const,
        sender: {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    ]

    render(
      <MessageList
        messages={messages}
        isLoading={false}
        currentUserId={1}
        isDirectMessage={true}
      />,
      {
        wrapper: createWrapper(),
      }
    )

    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument() // Current user sender
    expect(screen.getByText('user2')).toBeInTheDocument() // Other user sender
  })
})
