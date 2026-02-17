import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router-dom'
import ChatDock from '@/components/chat/ChatDock'
import { ChatProvider } from '@/providers/ChatProvider'

// This test ensures that when a direct message is received from a friend,
// the ChatDock shows an unread indicator (badge/icon) so users can see new DMs
// without opening the dock.

describe('ChatDock unread indicator for DM', () => {
  const server = setupServer()
  const queryClient = new QueryClient()

  beforeAll(() => server.listen())
  afterEach(() => {
    server.resetHandlers()
    queryClient.clear()
  })
  afterAll(() => server.close())

  it('shows an unread badge when a new direct message arrives', async () => {
    // Mock conversations list to include a DM
    server.use(
      rest.get('/api/conversations', (_req, res, ctx) => {
        return res(
          ctx.json([
            {
              id: 200,
              participants: [{ id: 2, username: 'friend' }],
              last_message: null,
            },
          ])
        )
      }),
      rest.get('/api/conversations/200/messages', (_req, res, ctx) => {
        return res(ctx.json([]))
      })
    )

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChatProvider>
            <ChatDock />
          </ChatProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Initially no unread badge
    expect(
      screen.queryByTestId('chat-dock-unread-badge')
    ).not.toBeInTheDocument()

    // Simulate receiving a WS message by invoking the API that the realtime
    // notification system would cause: patch the conversations cache and the
    // chat provider's message subscription will update state. For unit test
    // simplicity we update the query cache and then re-render.
    const message = {
      id: 1,
      conversation_id: 200,
      content: 'hey',
      sender_id: 2,
    }

    queryClient.setQueryData(['chat', 'messages', 200], (old: any) => {
      return old && Array.isArray(old) ? [...old, message] : [message]
    })

    // Also update conversations so last_message is set
    queryClient.setQueryData(['chat', 'conversations'], (old: any) => {
      if (!old) return [{ id: 200, last_message: message }]
      return old.map((c: any) =>
        c.id === 200 ? { ...c, last_message: message } : c
      )
    })

    // Re-render to allow ChatDock to pick up query changes
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChatProvider>
            <ChatDock />
          </ChatProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Expect unread badge to show
    await waitFor(() => {
      expect(screen.getByTestId('chat-dock-unread-badge')).toBeInTheDocument()
    })
  })
})
