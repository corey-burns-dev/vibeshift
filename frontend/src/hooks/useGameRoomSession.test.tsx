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
    // useManagedWebSocket expects a server "connected" handshake message.
    // Emit it in tests to avoid timeout-driven reconnect updates.
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'connected' }),
      })
    )
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

  it('resets join state when roomId changes (play-again flow)', async () => {
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

    // Start as non-creator in a pending room (room 100) — auto-join fires
    const { rerender } = renderHook(
      ({ roomId, room }) =>
        useGameRoomSession({
          roomId,
          token: 'token-a',
          room,
          currentUserId: 20,
        }),
      {
        initialProps: {
          roomId: 100 as number,
          room: {
            id: 100,
            status: 'pending',
            creator_id: 10,
            opponent_id: null as number | null,
          },
        },
      }
    )

    // Connect and auto-join room 100
    await act(async () => {
      await flushAsync()
      firstSocket.triggerOpen()
      await flushAsync()
    })

    expect(firstSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join_room', room_id: 100 })
    )
    firstSocket.send.mockClear()

    // Simulate game finishing — room status becomes 'finished'
    await act(async () => {
      rerender({
        roomId: 100,
        room: {
          id: 100,
          status: 'finished',
          creator_id: 10,
          opponent_id: 20,
        },
      })
    })

    // Now "Play Again" — navigate to a new pending room (room 200)
    // This simulates what happens when roomId changes in the same component
    await act(async () => {
      rerender({
        roomId: 200,
        room: {
          id: 200,
          status: 'pending',
          creator_id: 10,
          opponent_id: null,
        },
      })
      await flushAsync()
    })

    // Advance past reconnect delay so useManagedWebSocket creates the new socket
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
      await flushAsync()
    })

    await act(async () => {
      secondSocket.triggerOpen()
      await flushAsync()
    })

    // The join for room 200 must be sent despite having already joined room 100
    expect(secondSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join_room', room_id: 200 })
    )
  })

  it('allows manual joinRoom after roomId change even if previously joined', async () => {
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
      ({ roomId }) =>
        useGameRoomSession({
          roomId,
          token: 'token-a',
          autoJoinPendingRoom: false,
        }),
      {
        initialProps: { roomId: 100 as number },
      }
    )

    // Connect and manually join room 100
    await act(async () => {
      await flushAsync()
      firstSocket.triggerOpen()
      await flushAsync()
    })

    await act(async () => {
      const joined = result.current.joinRoom()
      expect(joined).toBe(true)
    })

    // Calling joinRoom again on same room returns true (already joined)
    await act(async () => {
      const joined = result.current.joinRoom()
      expect(joined).toBe(true)
    })
    expect(firstSocket.send).toHaveBeenCalledTimes(1)

    // Switch to room 200
    await act(async () => {
      rerender({ roomId: 200 })
      await flushAsync()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
      await flushAsync()
    })

    await act(async () => {
      secondSocket.triggerOpen()
      await flushAsync()
    })

    // joinRoom should work for the new room (not short-circuit from old hasJoined)
    await act(async () => {
      const joined = result.current.joinRoom()
      expect(joined).toBe(true)
    })

    expect(secondSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join_room', room_id: 200 })
    )
  })

  it('does not auto-join when current user is the creator', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    renderHook(() =>
      useGameRoomSession({
        roomId: 55,
        token: 'token-a',
        room: {
          id: 55,
          status: 'pending',
          creator_id: 10,
          opponent_id: null,
        },
        currentUserId: 10, // same as creator
      })
    )

    await act(async () => {
      await flushAsync()
      socket.triggerOpen()
      await flushAsync()
    })

    // No join_room should have been sent — creator waits for opponent
    expect(socket.send).not.toHaveBeenCalled()
  })

  it('does not auto-join an active room (already started)', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    renderHook(() =>
      useGameRoomSession({
        roomId: 55,
        token: 'token-a',
        room: {
          id: 55,
          status: 'active',
          creator_id: 10,
          opponent_id: 20,
        },
        currentUserId: 30, // not a participant
      })
    )

    await act(async () => {
      await flushAsync()
      socket.triggerOpen()
      await flushAsync()
    })

    expect(socket.send).not.toHaveBeenCalled()
  })

  it('dispatches incoming messages to the onAction callback', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    const onAction = vi.fn()

    renderHook(() =>
      useGameRoomSession({
        roomId: 60,
        token: 'token-a',
        onAction,
      })
    )

    await act(async () => {
      await flushAsync()
      socket.triggerOpen()
      await flushAsync()
    })

    const gameStatePayload = {
      type: 'game_state',
      payload: {
        board: [],
        status: 'active',
        winner_id: null,
        next_turn: 10,
        is_draw: false,
      },
    }

    await act(async () => {
      socket.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify(gameStatePayload),
        })
      )
    })

    expect(onAction).toHaveBeenCalledWith(gameStatePayload)
  })

  it('invokes onSocketOpen when the websocket connects', async () => {
    const socket = new MockSocket()
    vi.mocked(createTicketedWS).mockResolvedValue(
      socket as unknown as WebSocket
    )

    const onSocketOpen = vi.fn()

    renderHook(() =>
      useGameRoomSession({
        roomId: 61,
        token: 'token-a',
        onSocketOpen,
      })
    )

    await act(async () => {
      await flushAsync()
      socket.triggerOpen()
      await flushAsync()
    })

    expect(onSocketOpen).toHaveBeenCalledTimes(1)
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

  it('does not leave the room when token rotates for an active participant', async () => {
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

    const { rerender } = renderHook(
      ({ token }) =>
        useGameRoomSession({
          roomId: 88,
          token,
          room: {
            id: 88,
            status: 'active',
            creator_id: 10,
            opponent_id: 20,
          },
          currentUserId: 10,
        }),
      {
        initialProps: { token: 'token-a' },
      }
    )

    await act(async () => {
      await flushAsync()
      firstSocket.triggerOpen()
      await flushAsync()
      await vi.advanceTimersByTimeAsync(1)
    })

    await act(async () => {
      rerender({ token: 'token-b' })
      await flushAsync()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
      await flushAsync()
      secondSocket.triggerOpen()
      await flushAsync()
    })

    expect(apiClient.leaveGameRoom).not.toHaveBeenCalled()
  })
})
