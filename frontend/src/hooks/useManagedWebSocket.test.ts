import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManagedWebSocket } from './useManagedWebSocket'

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

  triggerClose() {
    this.readyState = 3
    this.onclose?.(new Event('close') as CloseEvent)
  }
}

describe('useManagedWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('tracks disconnected/connecting/connected states', async () => {
    const socket = new MockSocket()
    const createSocket = vi.fn(async () => socket as unknown as WebSocket)

    const { result } = renderHook(() =>
      useManagedWebSocket({
        enabled: true,
        createSocket,
      })
    )

    expect(result.current.connectionState).toBe('connecting')

    await act(async () => {
      await Promise.resolve()
      socket.triggerOpen()
    })

    expect(result.current.connectionState).toBe('connected')
    expect(createSocket).toHaveBeenCalledTimes(1)
  })

  it('reconnects with fixed delays 2s, 5s, then 10s', async () => {
    const sockets = [
      new MockSocket(),
      new MockSocket(),
      new MockSocket(),
      new MockSocket(),
    ]
    let idx = 0
    const createSocket = vi.fn(async () => {
      const socket = sockets[idx] ?? new MockSocket()
      idx += 1
      return socket as unknown as WebSocket
    })

    renderHook(() =>
      useManagedWebSocket({
        enabled: true,
        createSocket,
        reconnectDelaysMs: [2000, 5000, 10000],
      })
    )

    await act(async () => {
      await Promise.resolve()
      sockets[0].triggerClose()
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(createSocket).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(createSocket).toHaveBeenCalledTimes(2)

    await act(async () => {
      sockets[1].triggerClose()
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(createSocket).toHaveBeenCalledTimes(3)

    await act(async () => {
      sockets[2].triggerClose()
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(createSocket).toHaveBeenCalledTimes(4)
  })

  it('supports planned reconnect flag and clears it on successful open', async () => {
    const sockets = [new MockSocket(), new MockSocket()]
    let idx = 0
    const createSocket = vi.fn(async () => {
      const socket = sockets[idx] ?? new MockSocket()
      idx += 1
      return socket as unknown as WebSocket
    })

    const { result } = renderHook(() =>
      useManagedWebSocket({
        enabled: true,
        createSocket,
      })
    )

    await act(async () => {
      await Promise.resolve()
      sockets[0].triggerOpen()
    })

    expect(result.current.plannedReconnect).toBe(false)

    await act(async () => {
      result.current.reconnect(true)
    })

    expect(result.current.plannedReconnect).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    await act(async () => {
      await Promise.resolve()
      sockets[1].triggerOpen()
    })

    expect(result.current.plannedReconnect).toBe(false)
    expect(result.current.connectionState).toBe('connected')
  })

  it('cleans up socket on disable', async () => {
    const socket = new MockSocket()
    const createSocket = vi.fn(async () => socket as unknown as WebSocket)

    const { rerender } = renderHook(
      ({ enabled }) =>
        useManagedWebSocket({
          enabled,
          createSocket,
        }),
      { initialProps: { enabled: true } }
    )

    await act(async () => {
      await Promise.resolve()
      socket.triggerOpen()
    })

    await act(async () => {
      rerender({ enabled: false })
    })

    expect(socket.close).toHaveBeenCalled()
  })

  it('auto-responds to ping messages with pong', async () => {
    const socket = new MockSocket()
    const onMessage = vi.fn()
    const createSocket = vi.fn(async () => socket as unknown as WebSocket)

    renderHook(() =>
      useManagedWebSocket({
        enabled: true,
        createSocket,
        onMessage,
      })
    )

    await act(async () => {
      await Promise.resolve()
      socket.triggerOpen()
    })

    await act(async () => {
      socket.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'PING' }),
        })
      )
    })

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PONG' }))
    expect(onMessage).not.toHaveBeenCalled()
  })
})
