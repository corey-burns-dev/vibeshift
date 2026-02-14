import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManagedWebSocket } from '@/hooks/useManagedWebSocket'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'
import { usePresenceStore } from './usePresence'
import {
  useNotificationStore,
  useRealtimeNotifications,
} from './useRealtimeNotifications'

vi.mock('@/hooks/useManagedWebSocket', () => ({
  useManagedWebSocket: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('useRealtimeNotifications', () => {
  let qc: QueryClient
  const reconnectMock = vi.fn()
  const setPlannedReconnectMock = vi.fn()

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    qc = new QueryClient()
    reconnectMock.mockReset()
    setPlannedReconnectMock.mockReset()
    vi.mocked(useManagedWebSocket).mockReturnValue({
      reconnect: reconnectMock,
      setPlannedReconnect: setPlannedReconnectMock,
      wsRef: { current: null },
      connectionState: 'disconnected',
      plannedReconnect: false,
      close: vi.fn(),
    })

    useAuthSessionStore.getState().clear()
    usePresenceStore.getState().reset()
    useNotificationStore.getState().clear()
  })

  afterEach(() => {
    qc.clear()
    vi.clearAllMocks()
  })

  it('clears presence snapshot when disabled', async () => {
    usePresenceStore.getState().setInitialOnlineUsers([1, 2, 3])

    renderHook(() => useRealtimeNotifications(false), { wrapper })

    await act(async () => {})

    expect(usePresenceStore.getState().onlineUserIds.size).toBe(0)
  })

  it('flags planned reconnect when access token rotates', async () => {
    act(() => {
      useAuthSessionStore.getState().setAccessToken('token-a')
    })

    renderHook(() => useRealtimeNotifications(true), { wrapper })

    await act(async () => {})

    expect(setPlannedReconnectMock).not.toHaveBeenCalled()
    expect(reconnectMock).not.toHaveBeenCalled()

    act(() => {
      useAuthSessionStore.getState().setAccessToken('token-b')
    })

    await act(async () => {})

    expect(setPlannedReconnectMock).toHaveBeenCalledWith(true)
    expect(reconnectMock).toHaveBeenCalledWith(true)
  })
})
