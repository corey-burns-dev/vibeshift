import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'
import { ChatProvider, useChatContext } from './ChatProvider'

// Mock apiClient
vi.mock('@/api/client', () => ({
  apiClient: {
    issueWSTicket: vi
      .fn()
      .mockResolvedValue({ ticket: 'test-ticket', expires_in: 60 }),
    getMyBlocks: vi.fn().mockResolvedValue([]),
  },
}))

type GlobalWithMocks = typeof globalThis & {
  WebSocket?: unknown
  localStorage?: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
    removeItem(k: string): void
    clear(): void
  }
}

// Minimal harness component to access context
function HookTest({
  cb,
}: {
  cb: (ctx: ReturnType<typeof useChatContext>) => void
}) {
  const ctx = useChatContext()
  React.useEffect(() => cb(ctx), [ctx, cb])
  return null
}

// Mock WebSocket: connection/open is deferred so tests can run it inside act()
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static nextShouldClose = false
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  readyState = 0
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  /** Run deferred open (or close if nextShouldClose). Call inside act(). */
  flushConnect() {
    if (MockWebSocket.nextShouldClose) {
      MockWebSocket.nextShouldClose = false
      this.readyState = 3
      this.onclose?.()
      return
    }
    this.readyState = 1
    this.onopen?.()
  }

  send(_data: string) {}
  close() {
    this.readyState = 3
    this.onclose?.()
  }

  /** Simulate inbound server message. Call inside act(). */
  receive(obj: unknown) {
    const data = typeof obj === 'string' ? obj : JSON.stringify(obj)
    this.onmessage?.({ data })
  }
}

describe('ChatProvider websocket behavior', () => {
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
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    originalWS = (globalThis as GlobalWithMocks).WebSocket
    ;(globalThis as GlobalWithMocks).WebSocket =
      MockWebSocket as unknown as GlobalWithMocks['WebSocket']
    qc = new QueryClient()
    // set token + user in localStorage so provider attempts connect
    // provide simple in-memory localStorage for test environment
    const _store: Record<string, string> = {}
    ;(globalThis as GlobalWithMocks).localStorage = {
      getItem: (k: string) => _store[k] ?? null,
      setItem: (k: string, v: string) => {
        _store[k] = String(v)
      },
      removeItem: (k: string) => {
        delete _store[k]
      },
      clear: () => {
        for (const k of Object.keys(_store)) delete _store[k]
      },
      length: 0,
      key: () => null,
    }
    // set token + user in localStorage so provider attempts connect
    const jwtPayload = { exp: Math.floor(Date.now() / 1000) + 60 * 60 }
    const base = btoa(JSON.stringify(jwtPayload))
    const token = `a.${base}.c`
    useAuthSessionStore.getState().setAccessToken(token)
    localStorage.setItem('user', JSON.stringify({ id: 42, username: 'alice' }))
  })

  afterEach(() => {
    ;(globalThis as GlobalWithMocks).WebSocket =
      originalWS as GlobalWithMocks['WebSocket']
    MockWebSocket.instances = []
    ;(
      globalThis as GlobalWithMocks as { localStorage?: unknown }
    ).localStorage = undefined
    useAuthSessionStore.getState().clear()
    qc.clear()
    vi.useRealTimers()
  })

  it('dedupes duplicate message and room_message events', async () => {
    vi.useFakeTimers()
    const calls: Array<[unknown, number]> = []

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx =>
            ctx.subscribeOnMessage((m: unknown, id: number) =>
              calls.push([m, id])
            )
          }
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWebSocket.instances[0]
      if (w) w.flushConnect()
    })

    expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    const ws = MockWebSocket.instances[0]

    const msg = {
      type: 'message',
      conversation_id: 1,
      payload: { id: 123, content: 'hi' },
    }
    const roomMsg = {
      type: 'room_message',
      conversation_id: 1,
      payload: { id: 123, content: 'hi' },
    }

    act(() => {
      ws.receive(msg)
      ws.receive(roomMsg)
    })

    // give microtasks a turn
    await act(async () => {})

    expect(calls.length).toBe(1)
    expect(calls[0][1]).toBe(1)
    expect((calls[0][0] as { id: number }).id).toBe(123)
  })

  it('retries connecting after initial failure', async () => {
    vi.useFakeTimers()

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    MockWebSocket.nextShouldClose = true

    act(() => {
      render(<HookTest cb={() => {}} />, { wrapper })
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const firstWs = MockWebSocket.instances[0]
      if (firstWs) firstWs.flushConnect()
    })
    expect(MockWebSocket.instances.length).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(MockWebSocket.instances.length).toBeGreaterThan(1)
  })

  it('ignores room_message for unknown conversation', async () => {
    vi.useFakeTimers()
    const calls: Array<[unknown, number]> = []

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx =>
            ctx.subscribeOnMessage((m: unknown, id: number) =>
              calls.push([m, id])
            )
          }
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWebSocket.instances[0]
      if (w) w.flushConnect()
    })

    expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.receive({
        type: 'room_message',
        conversation_id: 999,
        payload: { id: 321, content: 'unknown room' },
      })
    })

    await act(async () => {})
    expect(calls.length).toBe(0)
  })

  it('accepts room_message for known conversation', async () => {
    vi.useFakeTimers()
    const calls: Array<[unknown, number]> = []
    qc.setQueryData(['chat', 'conversations'], [{ id: 77 }])

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    act(() => {
      render(
        <HookTest
          cb={ctx =>
            ctx.subscribeOnMessage((m: unknown, id: number) =>
              calls.push([m, id])
            )
          }
        />,
        { wrapper }
      )
    })
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      const w = MockWebSocket.instances[0]
      if (w) w.flushConnect()
    })

    expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    const ws = MockWebSocket.instances[0]

    act(() => {
      ws.receive({
        type: 'room_message',
        conversation_id: 77,
        payload: { id: 322, content: 'known room' },
      })
    })

    await act(async () => {})
    expect(calls.length).toBe(1)
    expect(calls[0][1]).toBe(77)
  })
})
