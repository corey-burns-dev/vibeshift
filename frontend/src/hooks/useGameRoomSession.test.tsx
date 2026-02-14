import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { createTicketedWS } from '@/lib/ws-utils'
import { useGameRoomSession } from './useGameRoomSession'

vi.mock('@/lib/ws-utils', () => ({
  createTicketedWS: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: {
    leaveGameRoom: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    error: vi.fn(),
  },
}))

class MockSocket {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
    this.onclose?.(new Event('close') as CloseEvent)
  })

  triggerOpen() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
}

describe('useGameRoomSession', () => {
  const flushAsync = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(apiClient.leaveGameRoom).mockResolvedValue({
      message: 'ok',
      status: 'active',
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('queues manual join while connecting and sends join after open', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    const { result } = renderHook(() =>
      useGameRoomSession({
        roomId: 42,
        token: 'token-a',
      })
    )

    await act(async () => {
      await flushAsync()
    })

    await act(async () => {
      const didJoin = result.current.joinRoom()
      expect(didJoin).toBe(false)
    })

    expect(result.current.isSocketReady).toBe(false)

    await act(async () => {
      socket.triggerOpen()
    })

    expect(result.current.isSocketReady).toBe(true)
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join_room', room_id: 42 })
    )
  })

  it('auto-joins pending room for non-creator on connect', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    renderHook(() =>
      useGameRoomSession({
        roomId: 77,
        token: 'token-a',
        room: {
          id: 77,
          status: 'pending',
          creator_id: 10,
          opponent_id: null,
        },
        currentUserId: 20,
      })
    )

    await act(async () => {
      await flushAsync()
      socket.triggerOpen()
      await flushAsync()
    })

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join_room', room_id: 77 })
    )
  })

  it('sends actions only when connected and defaults room_id', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    const { result } = renderHook(() =>
      useGameRoomSession({
        roomId: 99,
        token: 'token-a',
      })
    )

    await act(async () => {
      await flushAsync()
    })

    await act(async () => {
      const sent = result.current.sendAction({
        type: 'chat',
        payload: { text: 'hi' },
      })
      expect(sent).toBe(false)
    })

    await act(async () => {
      socket.triggerOpen()
    })

    await act(async () => {
      const sent = result.current.sendAction({
        type: 'chat',
        payload: { text: 'hi' },
      })
      expect(sent).toBe(true)
    })

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'chat',
        payload: { text: 'hi' },
        room_id: 99,
      })
    )
  })

  it('performs planned reconnect when token rotates', async () => {
    const firstSocket = new MockSocket()
    const secondSocket = new MockSocket()
    const sockets = [firstSocket, secondSocket]

    vi.mocked(createTicketedWS).mockImplementation(async () => {
      const next = sockets.shift()
      if (!next) {
        throw new Error('no socket left')
      }
      return next as unknown as WebSocket
    })

    const { rerender, result } = renderHook(
      ({ token }) =>
        useGameRoomSession({
          roomId: 50,
          token,
        }),
      {
        initialProps: { token: 'token-a' },
      }
    )

    await act(async () => {
      await flushAsync()
      firstSocket.triggerOpen()
      await flushAsync()
    })

    expect(result.current.isSocketReady).toBe(true)

    await act(async () => {
      rerender({ token: 'token-b' })
    })

    expect(firstSocket.close).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(createTicketedWS).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await flushAsync()
    })

    expect(createTicketedWS).toHaveBeenCalledTimes(2)

    await act(async () => {
      secondSocket.triggerOpen()
      await flushAsync()
    })

    expect(result.current.isSocketReady).toBe(true)
  })
})
