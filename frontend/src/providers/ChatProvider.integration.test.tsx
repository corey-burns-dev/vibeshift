/**
 * Integration tests for ChatProvider: WebSocket connection, message flow,
 * and subscription behavior. Builds on unit tests in ChatProvider.spec.tsx.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  shouldPlayFriendDMInMessagesView,
  shouldPlayFriendOnlineSound,
} from '@/lib/chat-sounds'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'
import { ChatProvider, useChatContext } from './ChatProvider'

vi.mock('@/api/client', () => ({
  apiClient: {
    issueWSTicket: vi
      .fn()
      .mockResolvedValue({ ticket: 'test-ticket', expires_in: 60 }),
    getMyBlocks: vi.fn().mockResolvedValue([]),
  },
}))

const mockPlayNewMessageSound = vi.fn()
const mockPlayFriendOnlineSound = vi.fn()
vi.mock('@/hooks/useAudio', () => ({
  useAudio: () => ({
    playNewMessageSound: mockPlayNewMessageSound,
    playFriendOnlineSound: mockPlayFriendOnlineSound,
    playDirectMessageSound: vi.fn(),
    playRoomAlertSound: vi.fn(),
    playDropPieceSound: vi.fn(),
  }),
}))

type GlobalWithMocks = typeof globalThis & {
  WebSocket?: unknown
  localStorage?: Storage
}

function HookTest({
  cb,
}: {
  cb: (ctx: ReturnType<typeof useChatContext>) => void
}) {
  const ctx = useChatContext()
  React.useEffect(() => cb(ctx), [ctx, cb])
  return null
}

class MockWS {
  static instances: MockWS[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  readyState = 0
  url: string
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWS.instances.push(this)
  }

  /** Run deferred open. Call inside act() so setIsConnected runs inside act. */
  flushOpen() {
    this.readyState = 1
    this.onopen?.()
  }

  send(_data?: string) {}
  close() {
    this.readyState = 3
  }

  receive(obj: unknown) {
    const data = typeof obj === 'string' ? obj : JSON.stringify(obj)
    this.onmessage?.({ data })
  }
}

describe('ChatProvider integration', () => {
  let originalWS: unknown
  let qc: QueryClient
  let originalConsoleError: typeof console.error

  beforeAll(() => {
    originalConsoleError = console.error
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const combined = args.map(a => String(a)).join(' ')
      if (
        combined.includes('ChatProvider') &&
        combined.includes('was not wrapped in act')
      )
        return
      originalConsoleError.apply(console, args)
    })
    const store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = String(v)
        },
        removeItem: (k: string) => delete store[k],
        clear: () => {
          for (const k of Object.keys(store)) delete store[k]
        },
      },
    })
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    originalWS = (globalThis as GlobalWithMocks).WebSocket
    ;(globalThis as GlobalWithMocks).WebSocket =
      MockWS as unknown as GlobalWithMocks['WebSocket']
    MockWS.instances = []
    qc = new QueryClient()
    const jwt = { exp: Math.floor(Date.now() / 1000) + 3600 }
    const base = btoa(JSON.stringify(jwt))
    const token = `a.${base}.c`
    useAuthSessionStore.getState().setAccessToken(token)
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as GlobalWithMocks).WebSocket =
      originalWS as GlobalWithMocks['WebSocket']
    MockWS.instances = []
    useAuthSessionStore.getState().clear()
    qc.clear()
    mockPlayNewMessageSound.mockClear()
    mockPlayFriendOnlineSound.mockClear()
  })

  it('subscribed callback receives messages from WebSocket', async () => {
    vi.useFakeTimers()
    const received: unknown[] = []
    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx =>
            ctx.subscribeOnMessage((m: unknown) => {
              received.push(m)
            })
          }
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWS.instances[0]
      if (w) w.flushOpen()
    })

    expect(MockWS.instances.length).toBeGreaterThan(0)
    const ws = MockWS.instances[0]
    act(() => {
      ws.receive({
        type: 'message',
        conversation_id: 1,
        payload: { id: 10, content: 'Hi', sender_id: 2 },
      })
    })
    await act(async () => {})

    expect(received.length).toBe(1)
    expect((received[0] as { content: string }).content).toBe('Hi')
  })

  it('records join intent before open, re-joins on connect, and forwards typing events', async () => {
    vi.useFakeTimers()

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    const sent: string[] = []
    const typingReceived: {
      convId: number
      userId: number
      username: string
      isTyping: boolean
    }[] = []
    let capturedCtx: ReturnType<typeof useChatContext> | null = null

    function TestHook() {
      const ctx = useChatContext()
      capturedCtx = ctx
      React.useEffect(() => {
        // Subscribe to typing events
        const unsub = ctx.subscribeOnTyping(
          (convId, userId, username, isTyping) => {
            typingReceived.push({ convId, userId, username, isTyping })
          }
        )

        // Request join before socket open
        ctx.joinRoom(123)

        return () => unsub()
      }, [ctx])

      return null
    }

    // Render provider + hook
    act(() => {
      render(<TestHook />, { wrapper })
    })

    // Advance timers so the provider attempts the deferred connect and
    // a MockWS instance is created.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    // WS instance should exist now
    expect(MockWS.instances.length).toBeGreaterThan(0)
    const ws = MockWS.instances[0]

    // Patch send to record outgoing messages (mutate instance for test)
    ws.send = (msg?: string) => {
      if (!msg) return
      sent.push(msg)
      // also store on instance for visibility
      ws.sent = ws.sent || []
      ws.sent.push(msg)
    }

    // The provider should have recorded the join intent immediately
    expect(capturedCtx).not.toBeNull()
    // Use `as unknown as { joinedRooms: Set<number> }` to access internal state for test
    expect(
      (capturedCtx as unknown as { joinedRooms: Set<number> }).joinedRooms.has(
        123
      )
    ).toBe(true)

    // Now open the socket (this should trigger join messages to be sent)
    await act(async () => {
      ws.flushOpen()
    })

    // After open, the patched send should have recorded the join
    expect(sent.some(s => s.includes('join') && s.includes('123'))).toBe(true)

    // Simulate a typing event from server
    act(() => {
      ws.receive({
        type: 'typing',
        conversation_id: 123,
        user_id: 2,
        username: 'bob',
        is_typing: true,
      })
    })

    await act(async () => {})

    expect(typingReceived.length).toBeGreaterThan(0)
    expect(typingReceived[0].username).toBe('bob')
  })

  it('plays DM sound only on /messages and only on unread 0->1 transitions', async () => {
    vi.useFakeTimers()
    const currentUserId = 1
    const friendIds = [2]
    const notifiedUserIds = new Set<number>()
    const routePath = '/messages'
    const isMessagesRoute = routePath.includes('/messages')
    const conversation = { is_group: false, is_friend_dm: true }
    let capturedCtx: ReturnType<typeof useChatContext> | null = null

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx => {
            capturedCtx = ctx
            ctx.subscribeOnMessage(
              (msg: { sender_id?: number }, convId: number) => {
                if ((msg.sender_id ?? 0) === currentUserId) return
                const nextUnread = ctx.incrementUnread(convId)
                const prevUnread = nextUnread - 1
                if (
                  shouldPlayFriendDMInMessagesView(
                    conversation,
                    isMessagesRoute,
                    prevUnread
                  )
                ) {
                  mockPlayNewMessageSound()
                }
              }
            )
            ctx.subscribeOnPresence(
              (userId: number, _username: string, status: string) => {
                if (
                  shouldPlayFriendOnlineSound(
                    userId,
                    status,
                    currentUserId,
                    notifiedUserIds,
                    friendIds
                  )
                ) {
                  notifiedUserIds.add(userId)
                  mockPlayFriendOnlineSound()
                }
              }
            )
          }}
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWS.instances[0]
      if (w) w.flushOpen()
    })

    expect(MockWS.instances.length).toBeGreaterThan(0)
    const ws = MockWS.instances[0]
    act(() => {
      ws.receive({
        type: 'message',
        conversation_id: 1,
        payload: { id: 10, content: 'Hi', sender_id: 2 },
      })
    })
    await act(async () => {})

    act(() => {
      ws.receive({
        type: 'message',
        conversation_id: 1,
        payload: { id: 11, content: 'Hi again', sender_id: 2 },
      })
    })
    await act(async () => {})

    expect(mockPlayNewMessageSound).toHaveBeenCalledTimes(1)

    act(() => {
      capturedCtx?.clearUnread(1)
    })

    act(() => {
      ws.receive({
        type: 'message',
        conversation_id: 1,
        payload: { id: 12, content: 'After open', sender_id: 2 },
      })
    })
    await act(async () => {})

    expect(mockPlayNewMessageSound).toHaveBeenCalledTimes(2)

    act(() => {
      ws.receive({
        type: 'presence',
        payload: { user_id: 2, username: 'friend', status: 'online' },
      })
    })
    await act(async () => {})

    expect(mockPlayFriendOnlineSound).toHaveBeenCalled()
  })

  it('does not play DM sound outside /messages', async () => {
    vi.useFakeTimers()
    const currentUserId = 1
    const routePath = '/posts'
    const isMessagesRoute = routePath.includes('/messages')
    const conversation = { is_group: false, is_friend_dm: true }

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx => {
            ctx.subscribeOnMessage((msg: { sender_id?: number }, convId) => {
              if ((msg.sender_id ?? 0) === currentUserId) return
              const nextUnread = ctx.incrementUnread(convId)
              const prevUnread = nextUnread - 1
              if (
                shouldPlayFriendDMInMessagesView(
                  conversation,
                  isMessagesRoute,
                  prevUnread
                )
              ) {
                mockPlayNewMessageSound()
              }
            })
          }}
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWS.instances[0]
      if (w) w.flushOpen()
    })

    const ws = MockWS.instances[0]
    act(() => {
      ws.receive({
        type: 'message',
        conversation_id: 1,
        payload: { id: 20, content: 'Off-route', sender_id: 2 },
      })
    })
    await act(async () => {})

    expect(mockPlayNewMessageSound).not.toHaveBeenCalled()
  })
})
