import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Message, User } from '@/api/types'
import { ChatDock } from '@/components/chat/ChatDock'

const toastMessageMock = vi.fn()
let onMessageSubscription:
  | ((message: Message, conversationId: number) => void)
  | null = null
const incrementUnreadMock = vi.fn(() => 1)
const clearUnreadMock = vi.fn()
const chatDockState = {
  isOpen: false,
  minimized: false,
  view: 'list' as const,
  activeConversationId: null as number | null,
  activePageConversationId: null as number | null,
  openConversationIds: [] as number[],
  unreadCounts: {} as Record<number, number>,
  toggle: vi.fn(),
  minimize: vi.fn(),
  close: vi.fn(),
  open: vi.fn(),
  setActiveConversation: vi.fn(),
  removeOpenConversation: vi.fn(),
  clearOpenConversations: vi.fn(),
}

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessageMock(...args),
  },
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({
    data: [{ id: 2, username: 'friend' }],
    isSuccess: true,
  }),
}))

vi.mock('@/hooks/useChat', () => ({
  useConversations: () => ({
    data: [
      {
        id: 1,
        is_group: false,
        name: null,
        participants: [{ id: 2, username: 'friend' }],
      },
    ],
  }),
  useConversation: () => ({ data: undefined }),
}))

vi.mock('@/providers/ChatProvider', () => ({
  useChatContext: () => ({
    isConnected: true,
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    sendTyping: vi.fn(),
    unreadByConversation: {},
    incrementUnread: incrementUnreadMock,
    clearUnread: clearUnreadMock,
    subscribeOnTyping: () => () => {},
    subscribeOnMessage: (
      cb: (message: Message, conversationId: number) => void
    ) => {
      onMessageSubscription = cb
      return () => {
        onMessageSubscription = null
      }
    },
  }),
}))

vi.mock('@/stores/useChatDockStore', () => ({
  useChatDockStore: Object.assign(() => chatDockState, {
    getState: () => chatDockState,
  }),
}))

vi.mock('@/hooks/useUsers', () => ({
  getCurrentUser: () => ({ id: 1, username: 'me' }),
}))

vi.mock('@/hooks/useAudio', () => ({
  useAudio: () => ({
    playNewMessageSound: vi.fn(),
    playFriendOnlineSound: vi.fn(),
    playDirectMessageSound: vi.fn(),
    playRoomAlertSound: vi.fn(),
    playDropPieceSound: vi.fn(),
  }),
}))

function minimalUser(username: string): User {
  const t = new Date().toISOString()
  return {
    id: 2,
    username,
    email: `${username}@test.example`,
    created_at: t,
    updated_at: t,
  }
}

describe('ChatDock', () => {
  afterEach(() => {
    onMessageSubscription = null
    incrementUnreadMock.mockReset()
    clearUnreadMock.mockReset()
    toastMessageMock.mockReset()
  })

  it('ignores unknown-conversation messages for unread/toast updates', () => {
    render(
      <MemoryRouter initialEntries={['/posts']}>
        <ChatDock />
      </MemoryRouter>
    )

    expect(onMessageSubscription).toBeTypeOf('function')

    const now = new Date().toISOString()
    onMessageSubscription?.(
      {
        id: 50,
        conversation_id: 999,
        sender_id: 2,
        content: 'hello',
        message_type: 'text',
        is_read: false,
        created_at: now,
        updated_at: now,
        sender: minimalUser('friend'),
      },
      999
    )

    expect(incrementUnreadMock).not.toHaveBeenCalled()
    expect(toastMessageMock).not.toHaveBeenCalled()
  })

  it('increments unread and shows toast for known conversation messages', () => {
    render(
      <MemoryRouter initialEntries={['/posts']}>
        <ChatDock />
      </MemoryRouter>
    )

    const now = new Date().toISOString()
    onMessageSubscription?.(
      {
        id: 51,
        conversation_id: 1,
        sender_id: 2,
        content: 'hello known room',
        message_type: 'text',
        is_read: false,
        created_at: now,
        updated_at: now,
        sender: minimalUser('friend'),
      },
      1
    )

    expect(incrementUnreadMock).toHaveBeenCalledWith(1)
    expect(toastMessageMock).toHaveBeenCalled()
  })
})
