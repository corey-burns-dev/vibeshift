/**
 * Integration tests for ChatProvider: WebSocket connection, message flow,
 * and subscription behavior. Builds on unit tests in ChatProvider.spec.tsx.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider, useChatContext } from './ChatProvider'

vi.mock('@/api/client', () => ({
  apiClient: {
    issueWSTicket: vi
      .fn()
      .mockResolvedValue({ ticket: 'test-ticket', expires_in: 60 }),
  },
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

  constructor(url: string) {
    this.url = url
    MockWS.instances.push(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send() {}
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

  beforeAll(() => {
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

  beforeEach(() => {
    originalWS = (global as GlobalWithMocks).WebSocket
    ;(global as GlobalWithMocks).WebSocket =
      MockWS as unknown as GlobalWithMocks['WebSocket']
    MockWS.instances = []
    qc = new QueryClient()
    const jwt = { exp: Math.floor(Date.now() / 1000) + 3600 }
    const base = btoa(JSON.stringify(jwt))
    localStorage.setItem('token', `a.${base}.c`)
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u' }))
  })

  afterEach(() => {
    ;(global as GlobalWithMocks).WebSocket =
      originalWS as GlobalWithMocks['WebSocket']
    MockWS.instances = []
    qc.clear()
  })

  it('subscribed callback receives messages from WebSocket', async () => {
    const received: unknown[] = []
    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    )

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

    await waitFor(() => expect(MockWS.instances.length).toBeGreaterThan(0))
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
})
