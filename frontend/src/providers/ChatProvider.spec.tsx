import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider, useChatContext } from './ChatProvider'

// Mock apiClient
vi.mock('@/api/client', () => ({
  apiClient: {
    issueWSTicket: vi
      .fn()
      .mockResolvedValue({ ticket: 'test-ticket', expires_in: 60 }),
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

// Mock WebSocket
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
    // simulate async connect
    setTimeout(() => {
      if (MockWebSocket.nextShouldClose) {
        this.readyState = 3
        this.onclose?.()
        MockWebSocket.nextShouldClose = false
        return
      }
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send(_data: string) {}
  close() {
    this.readyState = 3
    this.onclose?.()
  }

  // helper to simulate inbound server message
  receive(obj: unknown) {
    const data = typeof obj === 'string' ? obj : JSON.stringify(obj)
    this.onmessage?.({ data })
  }
}

describe('ChatProvider websocket behavior', () => {
  let originalWS: unknown
  let qc: QueryClient

  beforeEach(() => {
    originalWS = (global as GlobalWithMocks).WebSocket
    ;(global as GlobalWithMocks).WebSocket =
      MockWebSocket as unknown as GlobalWithMocks['WebSocket']
    qc = new QueryClient()
    // set token + user in localStorage so provider attempts connect
    // provide simple in-memory localStorage for test environment
    const _store: Record<string, string> = {}
    ;(global as GlobalWithMocks).localStorage = {
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
    }
    // set token + user in localStorage so provider attempts connect
    const jwtPayload = { exp: Math.floor(Date.now() / 1000) + 60 * 60 }
    const base =
      typeof Buffer !== 'undefined'
        ? Buffer.from(JSON.stringify(jwtPayload)).toString('base64')
        : btoa(JSON.stringify(jwtPayload))
    localStorage.setItem('token', `a.${base}.c`)
    localStorage.setItem('user', JSON.stringify({ id: 42, username: 'alice' }))
  })

  afterEach(() => {
    ;(global as GlobalWithMocks).WebSocket =
      originalWS as GlobalWithMocks['WebSocket']
    MockWebSocket.instances = []
    delete (global as GlobalWithMocks).localStorage
    qc.clear()
    vi.useRealTimers()
  })

  it('dedupes duplicate message and room_message events', async () => {
    const calls: Array<[unknown, number]> = []

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

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

    // wait for websocket to be constructed/opened
    await waitFor(() =>
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    )
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
    expect(calls[0][0].id).toBe(123)
  })

  it('retries connecting after initial failure', async () => {
    vi.useFakeTimers()

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

    // Make the first WS instance immediately close to simulate initial failure
    MockWebSocket.nextShouldClose = true

    render(<HookTest cb={() => {}} />, { wrapper })

    // first instance created; advance timers so constructor runs and onclose is fired
    act(() => {
      vi.advanceTimersByTime(1)
    })
    await act(async () => {})

    expect(MockWebSocket.instances.length).toBe(1)

    // advance timers to trigger reconnect scheduling (code uses exponential backoff starting at 2000ms)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    await act(async () => {})

    // New connection attempt should have created another WebSocket instance
    expect(MockWebSocket.instances.length).toBeGreaterThan(1)
  })
})
