import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import type { GameRoomChatMessage } from '@/api/types'
import { createTestQueryClient } from '@/test/test-utils'
import { useGameChat } from './useGameChat'

vi.mock('@/api/client', () => ({
  apiClient: {
    getGameRoomMessages: vi.fn(),
  },
}))

function createWrapper(queryClient = createTestQueryClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function buildHistory(messages: Array<Partial<GameRoomChatMessage>>) {
  return messages.map((message, index) => ({
    id: index + 1,
    created_at: '2026-02-24T00:00:00Z',
    game_room_id: 7,
    user_id: 1,
    username: 'user',
    text: 'message',
    ...message,
  }))
}

describe('useGameChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads persisted history for the room', async () => {
    vi.mocked(apiClient.getGameRoomMessages).mockResolvedValue(
      buildHistory([
        { user_id: 10, username: 'alice', text: 'hello' },
        { user_id: 11, username: 'bob', text: 'gg' },
      ])
    )

    const { result } = renderHook(() => useGameChat(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { user_id: 10, username: 'alice', text: 'hello' },
        { user_id: 11, username: 'bob', text: 'gg' },
      ])
    })
    expect(apiClient.getGameRoomMessages).toHaveBeenCalledWith(7)
  })

  it('appends websocket messages via addMessage', async () => {
    vi.mocked(apiClient.getGameRoomMessages).mockResolvedValue(buildHistory([]))

    const { result } = renderHook(() => useGameChat(12), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(apiClient.getGameRoomMessages).toHaveBeenCalledWith(12)
    })

    act(() => {
      result.current.addMessage({
        user_id: 9,
        username: 'opponent',
        text: 'new message',
      })
    })

    expect(result.current.messages).toEqual([
      { user_id: 9, username: 'opponent', text: 'new message' },
    ])
  })

  it('does not fetch when roomId is null', () => {
    const { result } = renderHook(() => useGameChat(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.messages).toEqual([])
    expect(apiClient.getGameRoomMessages).not.toHaveBeenCalled()
  })

  it('deduplicates websocket messages when history resolves later', async () => {
    const pending = deferred<GameRoomChatMessage[]>()
    vi.mocked(apiClient.getGameRoomMessages).mockReturnValueOnce(
      pending.promise
    )

    const { result } = renderHook(() => useGameChat(99), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.addMessage({
        user_id: 7,
        username: 'alice',
        text: 'same-message',
      })
    })

    act(() => {
      pending.resolve(
        buildHistory([
          { user_id: 7, username: 'alice', text: 'same-message' },
          { user_id: 8, username: 'bob', text: 'other-message' },
        ])
      )
    })

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { user_id: 7, username: 'alice', text: 'same-message' },
        { user_id: 8, username: 'bob', text: 'other-message' },
      ])
    })
  })

  it('keeps repeated same-text websocket messages when only one overlaps history', async () => {
    const pending = deferred<GameRoomChatMessage[]>()
    vi.mocked(apiClient.getGameRoomMessages).mockReturnValueOnce(
      pending.promise
    )

    const { result } = renderHook(() => useGameChat(99), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.addMessage({
        user_id: 7,
        username: 'alice',
        text: 'same-message',
      })
      result.current.addMessage({
        user_id: 7,
        username: 'alice',
        text: 'same-message',
      })
    })

    act(() => {
      pending.resolve(
        buildHistory([
          { user_id: 7, username: 'alice', text: 'same-message' },
          { user_id: 8, username: 'bob', text: 'other-message' },
        ])
      )
    })

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { user_id: 7, username: 'alice', text: 'same-message' },
        { user_id: 8, username: 'bob', text: 'other-message' },
        { user_id: 7, username: 'alice', text: 'same-message' },
      ])
    })
  })

  it('refetches persisted history when remounting the same room', async () => {
    const queryClient = createTestQueryClient()
    const wrapper = createWrapper(queryClient)

    vi.mocked(apiClient.getGameRoomMessages)
      .mockResolvedValueOnce(
        buildHistory([{ user_id: 1, username: 'a', text: 'before-away' }])
      )
      .mockResolvedValueOnce(
        buildHistory([
          { user_id: 1, username: 'a', text: 'before-away' },
          { user_id: 2, username: 'b', text: 'while-away' },
        ])
      )

    const firstMount = renderHook(() => useGameChat(44), { wrapper })

    await waitFor(() => {
      expect(firstMount.result.current.messages).toEqual([
        { user_id: 1, username: 'a', text: 'before-away' },
      ])
    })

    firstMount.unmount()

    const secondMount = renderHook(() => useGameChat(44), { wrapper })

    await waitFor(() => {
      expect(apiClient.getGameRoomMessages).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(secondMount.result.current.messages).toEqual([
        { user_id: 1, username: 'a', text: 'before-away' },
        { user_id: 2, username: 'b', text: 'while-away' },
      ])
    })
  })

  it('resets and loads new history when roomId changes', async () => {
    vi.mocked(apiClient.getGameRoomMessages)
      .mockResolvedValueOnce(
        buildHistory([{ user_id: 1, username: 'a', text: 'room-1' }])
      )
      .mockResolvedValueOnce(
        buildHistory([{ user_id: 2, username: 'b', text: 'room-2' }])
      )

    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: number | null }) => useGameChat(roomId),
      {
        wrapper: createWrapper(),
        initialProps: { roomId: 1 },
      }
    )

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { user_id: 1, username: 'a', text: 'room-1' },
      ])
    })

    act(() => {
      result.current.addMessage({ user_id: 3, username: 'c', text: 'ws-1' })
    })
    expect(result.current.messages).toHaveLength(2)

    rerender({ roomId: 2 })

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { user_id: 2, username: 'b', text: 'room-2' },
      ])
    })
  })
})
