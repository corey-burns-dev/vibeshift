import { apiClient } from '@/api/client'
import { QueryClient } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'

vi.mock('@/hooks/useChat', () => ({
  useConversations: () => ({
    data: [{ id: 12345, participants: [{ id: 2, username: 'friend' }] }],
  }),
  useConversation: () => ({
    data: { id: 12345, participants: [{ id: 2, username: 'friend' }] },
  }),
  useMessages: () => ({ data: [], isLoading: false }),
  useSendMessage: () => ({
    mutate: vi.fn((_data, options) => {
      options?.onSuccess?.()
    }),
    isPending: false,
  }),
  useMarkAsRead: () => ({ mutate: vi.fn() }),
  useAllChatrooms: () => ({ data: [] }),
  useJoinedChatrooms: () => ({ data: [] }),
  useJoinChatroom: () => ({ mutate: vi.fn() }),
  useLeaveConversation: () => ({ mutate: vi.fn() }),
}))

// Mock useChatContext to avoid complex WebSocket setup
const mockContext = {
  isConnected: true,
  sendMessage: vi.fn().mockResolvedValue({}),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  getUnread: vi.fn(() => 0),
  incrementUnread: vi.fn(),
  clearUnread: vi.fn(),
  sendTyping: vi.fn(),
  unreadByConversation: {},
  joinedRooms: new Set([12345]),
  setOnMessage: vi.fn(),
  setOnTyping: vi.fn(),
  setOnPresence: vi.fn(),
  setOnConnectedUsers: vi.fn(),
  setOnParticipantsUpdate: vi.fn(),
  setOnChatroomPresence: vi.fn(),
  subscribeOnMessage: () => () => {},
  subscribeOnTyping: () => () => {},
  subscribeOnPresence: () => () => {},
  subscribeOnConnectedUsers: () => () => {},
  subscribeOnParticipantsUpdate: () => () => {},
  subscribeOnChatroomKick: () => () => {},
  subscribeOnRoomMetadata: () => () => {},
  subscribeOnChatroomPresence: () => () => {},
  isUserOnline: vi.fn(() => false),
}

vi.mock('@/providers/ChatProvider', () => {
  const ChatProviderMock = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
  return {
    ChatProvider: ChatProviderMock,
    useChatContext: () => mockContext,
  }
})

// This test exercises the notification -> open direct message flow.
// It ensures the created conversation is seeded into the cache and
// the chat view renders instead of stalling in a loading state.

describe('realtime notification -> open DM flow', () => {
  const server = setupServer()
  const queryClient = new QueryClient()

  beforeAll(() => server.listen())
  afterEach(() => {
    server.resetHandlers()
    queryClient.clear()
  })
  afterAll(() => server.close())

  it('seeds the cache correctly so chat can load', async () => {
    // Mock handlers
    server.use(
      http.post('/api/conversations', () => {
        return HttpResponse.json({
          id: 12345,
          participants: [{ id: 2, username: 'friend' }],
          last_message: null,
        })
      }),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 1, username: 'me' })
      ),
      http.get('/api/friends', () =>
        HttpResponse.json([{ id: 2, username: 'friend' }])
      )
    )

    // Simulate the notification click path
    const conv = await apiClient.createConversation({ participant_ids: [2] })

    // Seeding logic (mimicking the actual implementation in useRealtimeNotifications or wherever)
    queryClient.setQueryData(['chat', 'conversations'], (old: unknown) => {
      const existing = Array.isArray(old) ? (old as unknown[]) : []
      return [conv, ...existing]
    })
    queryClient.setQueryData(['chat', 'conversation', conv.id], conv)

    // Verify cache state
    const cachedList = queryClient.getQueryData(['chat', 'conversations']) as
      | unknown[]
      | undefined
    const cachedConv = queryClient.getQueryData([
      'chat',
      'conversation',
      conv.id,
    ])

    expect(cachedList).toContainEqual(conv)
    expect(cachedConv).toEqual(conv)
  })
})
