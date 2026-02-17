import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ChatDock } from '@/components/chat/ChatDock'

// Mock useChatContext to avoid complex WebSocket setup in unit test
vi.mock('@/providers/ChatProvider', () => ({
  useChatContext: vi.fn(),
}))

import { useChatContext } from '@/providers/ChatProvider'

describe('ChatDock unread indicator for DM', () => {
  const server = setupServer()
  const queryClient = new QueryClient()

  beforeAll(() => server.listen())
  afterEach(() => {
    server.resetHandlers()
    queryClient.clear()
    vi.clearAllMocks()
  })
  afterAll(() => server.close())

  it('shows an unread badge when a new direct message arrives', async () => {
    // Mock conversations list to include a DM
    server.use(
      http.get('/api/conversations', () => {
        return HttpResponse.json([
          {
            id: 200,
            participants: [{ id: 2, username: 'friend' }],
            last_message: null,
          },
        ])
      }),
      http.get('/api/conversations/200/messages', () => {
        return HttpResponse.json([])
      }),
      http.get('/api/friends', () => {
        return HttpResponse.json([{ id: 2, username: 'friend' }])
      })
    )

    // Initial state: 0 unread
    ;(
      useChatContext as unknown as { mockReturnValue: (v: unknown) => void }
    ).mockReturnValue({
      unreadByConversation: {},
      isUserOnline: vi.fn(() => false),
      subscribeOnMessage: () => () => {},
      subscribeOnTyping: () => () => {},
      subscribeOnPresence: () => () => {},
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChatDock />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Initially no unread badge
    expect(
      screen.queryByTestId('chat-dock-unread-badge')
    ).not.toBeInTheDocument()

    // Simulate unread count change in context
    ;(
      useChatContext as unknown as { mockReturnValue: (v: unknown) => void }
    ).mockReturnValue({
      unreadByConversation: { '200': 1 },
      isUserOnline: vi.fn(() => false),
      subscribeOnMessage: () => () => {},
      subscribeOnTyping: () => () => {},
      subscribeOnPresence: () => () => {},
    })

    // Expect unread badge to show
    await waitFor(() => {
      expect(screen.getByTestId('chat-dock-unread-badge')).toBeInTheDocument()
    })
  })
})
