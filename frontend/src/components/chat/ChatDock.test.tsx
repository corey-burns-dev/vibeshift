import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatDock } from '@/components/chat/ChatDock'

const toastMessageMock = vi.fn()
let onMessageSubscription:
  | ((message: any, conversationId: number) => void)
  | null = null
const incrementUnreadMock = vi.fn()
const chatDockState = {
  isOpen: false,
  minimized: false,
  view: 'list',
  activeConversationId: null as number | null,
  unreadCounts: {} as Record<number, number>,
  toggle: vi.fn(),
  minimize: vi.fn(),
  close: vi.fn(),
  setActiveConversation: vi.fn(),
  incrementUnread: incrementUnreadMock,
}

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessageMock(...args),
  },
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useChat', () => ({
  useConversations: () => ({
    data: [
      {
        id: 1,
        is_group: true,
        name: 'General',
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
    subscribeOnMessage: (
      cb: (message: any, conversationId: number) => void
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

describe('ChatDock', () => {
  afterEach(() => {
    onMessageSubscription = null
    incrementUnreadMock.mockReset()
    toastMessageMock.mockReset()
  })

  it('ignores unknown-conversation messages for unread/toast updates', () => {
    render(
      <MemoryRouter initialEntries={['/posts']}>
        <ChatDock />
      </MemoryRouter>
    )

    expect(onMessageSubscription).toBeTypeOf('function')

    onMessageSubscription?.(
      {
        id: 50,
        sender_id: 2,
        content: 'hello',
        sender: { username: 'friend' },
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

    onMessageSubscription?.(
      {
        id: 51,
        sender_id: 2,
        content: 'hello known room',
        sender: { username: 'friend' },
      },
      1
    )

    expect(incrementUnreadMock).toHaveBeenCalledWith(1)
    expect(toastMessageMock).toHaveBeenCalled()
  })
})
