import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import type { GameRoom } from '@/api/types'
import { getCurrentUser } from '@/hooks'
import { useAuthToken } from '@/hooks/useAuth'
import { useGameChat } from '@/hooks/useGameChat'
import { useGameRoomSession } from '@/hooks/useGameRoomSession'
import { useResumableGameRoomPresence } from '@/hooks/useResumableGameRoomPresence'
import { playVictoryJingle } from '@/lib/game-audio'
import { VICTORY_BLAST_DURATION_MS } from '@/lib/game-effects'
import { GAME_ROOM_REALTIME_EVENT } from '@/lib/game-realtime-events'
import { removeResumableGameRoom } from '@/lib/game-room-presence'
import { createTestQueryClient } from '@/test/test-utils'
import { useGameRoomCore } from './useGameRoomCore'

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/api/client', () => ({
  apiClient: {
    getGameRoom: vi.fn(),
    getActiveGameRooms: vi.fn(),
    createGameRoom: vi.fn(),
    leaveGameRoom: vi.fn(),
  },
}))

vi.mock('@/hooks', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuthToken: vi.fn(),
}))

vi.mock('@/hooks/useGameChat', () => ({
  useGameChat: vi.fn(),
}))

vi.mock('@/hooks/useGameRoomSession', () => ({
  useGameRoomSession: vi.fn(),
}))

vi.mock('@/hooks/useResumableGameRoomPresence', () => ({
  useResumableGameRoomPresence: vi.fn(),
}))

vi.mock('@/lib/chat-utils', () => ({
  getAvatarUrl: vi.fn((username: string) => `avatar:${username}`),
}))

vi.mock('@/lib/game-audio', () => ({
  playVictoryJingle: vi.fn(),
}))

vi.mock('@/lib/game-room-presence', () => ({
  removeResumableGameRoom: vi.fn(),
}))

function buildRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    id: 7,
    type: 'connect4',
    status: 'active',
    creator_id: 10,
    opponent_id: 20,
    winner_id: undefined,
    is_draw: false,
    next_turn_id: 10,
    current_state: '[[""], [""]]',
    creator: {
      id: 10,
      username: 'creator',
      email: 'creator@example.com',
      created_at: '2026-02-24T00:00:00.000Z',
      updated_at: '2026-02-24T00:00:00.000Z',
    },
    opponent: {
      id: 20,
      username: 'opponent',
      email: 'opponent@example.com',
      created_at: '2026-02-24T00:00:00.000Z',
      updated_at: '2026-02-24T00:00:00.000Z',
    },
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createWrapper(route = '/games/connect4/7') {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return { Wrapper, queryClient }
}

describe('useGameRoomCore', () => {
  let mockNavigate: ReturnType<typeof useNavigate>
  let mockJoinRoomSpy: ReturnType<typeof vi.fn>
  let mockJoinRoom: ReturnType<typeof useGameRoomSession>['joinRoom']
  let mockSendActionSpy: ReturnType<typeof vi.fn>
  let mockSendAction: ReturnType<typeof useGameRoomSession>['sendAction']
  let mockAddMessageSpy: ReturnType<typeof vi.fn>
  let mockAddMessage: ReturnType<typeof useGameChat>['addMessage']
  let latestOnAction: Parameters<typeof useGameRoomSession>[0]['onAction']

  const baseRoom = buildRoom()

  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    mockNavigate = vi.fn() as unknown as ReturnType<typeof useNavigate>
    mockJoinRoomSpy = vi.fn(() => true)
    mockJoinRoom = mockJoinRoomSpy as unknown as ReturnType<
      typeof useGameRoomSession
    >['joinRoom']
    mockSendActionSpy = vi.fn(() => true)
    mockSendAction = mockSendActionSpy as unknown as ReturnType<
      typeof useGameRoomSession
    >['sendAction']
    mockAddMessageSpy = vi.fn()
    mockAddMessage = mockAddMessageSpy as unknown as ReturnType<
      typeof useGameChat
    >['addMessage']
    latestOnAction = undefined

    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 10,
      username: 'creator',
      email: 'creator@example.com',
      created_at: '2026-02-24T00:00:00.000Z',
      updated_at: '2026-02-24T00:00:00.000Z',
    })
    vi.mocked(useAuthToken).mockReturnValue('token-a')
    vi.mocked(apiClient.getGameRoom).mockResolvedValue(baseRoom)
    vi.mocked(apiClient.getActiveGameRooms).mockResolvedValue([])
    vi.mocked(apiClient.createGameRoom).mockResolvedValue(buildRoom({ id: 99 }))
    vi.mocked(apiClient.leaveGameRoom).mockResolvedValue({
      message: 'ok',
      status: 'cancelled',
    })

    vi.mocked(useGameChat).mockReturnValue({
      messages: [],
      addMessage: mockAddMessage,
    })

    vi.mocked(useGameRoomSession).mockImplementation(options => {
      latestOnAction = options.onAction
      return {
        isSocketReady: true,
        sendAction: mockSendAction,
        joinRoom: mockJoinRoom,
        wsRef: { current: null },
      } as ReturnType<typeof useGameRoomSession>
    })

    vi.mocked(useResumableGameRoomPresence).mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function renderCore(
    overrides: Partial<Parameters<typeof useGameRoomCore>[0]> = {}
  ) {
    const onBoardAction = vi.fn()
    const { Wrapper, queryClient } = createWrapper('/games/connect4/7')

    const hook = renderHook(
      () =>
        useGameRoomCore({
          roomId: 7,
          roomIdParam: '7',
          gameType: 'connect4',
          gameLabel: 'Connect 4',
          onBoardAction,
          ...overrides,
        }),
      { wrapper: Wrapper }
    )

    return { ...hook, queryClient, onBoardAction }
  }

  it('seeds core state and player derivations from room query', async () => {
    const { result } = renderCore()

    await waitFor(() => {
      expect(result.current.coreState).not.toBeNull()
    })

    expect(result.current.coreState).toEqual({
      status: 'active',
      winner_id: null,
      next_turn: 10,
      is_draw: false,
    })
    expect(result.current.isCreator).toBe(true)
    expect(result.current.isOpponent).toBe(false)
    expect(result.current.isPlayer).toBe(true)
    expect(result.current.isMyTurn).toBe(true)
    expect(result.current.playerOneName).toBe('creator')
    expect(result.current.playerTwoName).toBe('opponent')
    expect(useResumableGameRoomPresence).toHaveBeenCalled()
  })

  it('handles game_state socket actions via core state + onBoardAction callback', async () => {
    const { result, onBoardAction, queryClient } = renderCore()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    const payload = {
      board: [[1, 2, 3]],
      status: 'finished',
      winner_id: 20,
      next_turn: 20,
      is_draw: false,
    }

    act(() => {
      latestOnAction?.({ type: 'game_state', payload })
    })

    expect(onBoardAction).toHaveBeenCalledWith('game_state', payload)
    expect(result.current.coreState).toEqual({
      status: 'finished',
      winner_id: 20,
      next_turn: 20,
      is_draw: false,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gameRoom', '7'] })
  })

  it('handles game_started only once for toast while still forwarding board actions', async () => {
    const { onBoardAction } = renderCore()

    const payload = {
      status: 'active',
      next_turn: 10,
      current_state: '{}',
    }

    await waitFor(() => expect(latestOnAction).toBeTypeOf('function'))

    act(() => {
      latestOnAction?.({ type: 'game_started', payload })
      latestOnAction?.({ type: 'game_started', payload })
    })

    expect(onBoardAction).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Connect 4 Started!', {
      description: 'Your opponent has joined.',
    })
  })

  it('routes chat actions to addMessage', async () => {
    renderCore()

    await waitFor(() => expect(latestOnAction).toBeTypeOf('function'))

    act(() => {
      latestOnAction?.({
        type: 'chat',
        user_id: 20,
        payload: {
          username: 'opponent',
          text: 'gg',
        },
      })
    })

    expect(mockAddMessageSpy).toHaveBeenCalledWith({
      user_id: 20,
      username: 'opponent',
      text: 'gg',
    })
  })

  it('maps creator-join errors to user-friendly toast text', async () => {
    renderCore()

    await waitFor(() => expect(latestOnAction).toBeTypeOf('function'))

    act(() => {
      latestOnAction?.({
        type: 'error',
        payload: {
          message: 'You are the creator',
        },
      })
    })

    expect(toast.error).toHaveBeenCalledWith('Game Error', {
      description:
        'Open the room from a different account to join as opponent.',
    })
  })

  it('handles game_cancelled by updating state, pruning presence, and navigating away', async () => {
    const { result } = renderCore()

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    act(() => {
      latestOnAction?.({
        type: 'game_cancelled',
        payload: { message: 'A player left the room' },
      })
    })

    expect(result.current.coreState?.status).toBe('cancelled')
    expect(removeResumableGameRoom).toHaveBeenCalledWith(10, 7)
    expect(toast.error).toHaveBeenCalledWith('Game cancelled', {
      description: 'A player left the room',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/games')
  })

  it('suppresses cancel notification when leave was initiated locally', async () => {
    const { result } = renderCore()
    const leaveDeferred = deferred<{ message: string; status: string }>()
    vi.mocked(apiClient.leaveGameRoom).mockReturnValueOnce(
      leaveDeferred.promise
    )

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    act(() => {
      void result.current.handleLeaveGame()
    })

    act(() => {
      latestOnAction?.({
        type: 'game_cancelled',
        payload: { message: 'A player left the room' },
      })
    })

    expect(toast.error).not.toHaveBeenCalledWith('Game cancelled', {
      description: 'A player left the room',
    })
    expect(mockNavigate).not.toHaveBeenCalledWith('/games')

    await act(async () => {
      leaveDeferred.resolve({ message: 'ok', status: 'cancelled' })
      await flush()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/games')
  })

  it('resets local leave guard after leave failure so later cancel notifies', async () => {
    const { result } = renderCore()

    vi.mocked(apiClient.leaveGameRoom).mockRejectedValueOnce(new Error('boom'))

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    await act(async () => {
      await result.current.handleLeaveGame()
    })

    act(() => {
      latestOnAction?.({
        type: 'game_cancelled',
        payload: { message: 'A player left the room' },
      })
    })

    expect(toast.error).toHaveBeenCalledWith('Unable to leave game')
    expect(toast.error).toHaveBeenCalledWith('Game cancelled', {
      description: 'A player left the room',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/games')
  })

  it('auto-joins when user can join a pending room', async () => {
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 30,
      username: 'challenger',
      email: 'challenger@example.com',
      created_at: '2026-02-24T00:00:00.000Z',
      updated_at: '2026-02-24T00:00:00.000Z',
    })
    vi.mocked(apiClient.getGameRoom).mockResolvedValueOnce(
      buildRoom({
        status: 'pending',
        creator_id: 10,
        opponent_id: undefined,
        next_turn_id: 10,
      })
    )

    const { result } = renderCore()

    await waitFor(() => {
      expect(result.current.canJoin).toBe(true)
    })

    expect(mockJoinRoomSpy).toHaveBeenCalled()
  })

  it('sendChat trims input and clears only on successful send', async () => {
    const { result } = renderCore()

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    act(() => {
      result.current.setChatInput('  hello  ')
    })

    act(() => {
      result.current.sendChat()
    })

    expect(mockSendActionSpy).toHaveBeenCalledWith({
      type: 'chat',
      payload: {
        text: 'hello',
        username: 'creator',
      },
    })
    expect(result.current.chatInput).toBe('')

    mockSendActionSpy.mockReturnValueOnce(false)
    act(() => {
      result.current.setChatInput('  blocked  ')
    })

    act(() => {
      result.current.sendChat()
    })

    expect(result.current.chatInput).toBe('  blocked  ')
  })

  it('realtime room events invalidate only relevant room queries', async () => {
    const { queryClient } = renderCore()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await waitFor(() => expect(latestOnAction).toBeTypeOf('function'))

    act(() => {
      window.dispatchEvent(
        new CustomEvent(GAME_ROOM_REALTIME_EVENT, {
          detail: { roomId: 8 },
        })
      )
    })

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['gameRoom', '7'],
    })

    act(() => {
      window.dispatchEvent(
        new CustomEvent(GAME_ROOM_REALTIME_EVENT, {
          detail: { roomId: 7 },
        })
      )
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gameRoom', '7'] })

    act(() => {
      window.dispatchEvent(new CustomEvent(GAME_ROOM_REALTIME_EVENT))
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gameRoom', '7'] })
  })

  it('handlePlayAgain prefers joinable room, then own pending room, then create', async () => {
    const { result } = renderCore()

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))

    vi.mocked(apiClient.getActiveGameRooms).mockResolvedValueOnce([
      buildRoom({
        id: 44,
        status: 'pending',
        creator_id: 99,
        opponent_id: undefined,
        opponent: undefined,
      }),
    ])

    await act(async () => {
      await result.current.handlePlayAgain()
    })

    expect(mockNavigate).toHaveBeenLastCalledWith('/games/connect4/44')

    vi.mocked(apiClient.getActiveGameRooms).mockResolvedValueOnce([
      buildRoom({
        id: 45,
        status: 'pending',
        creator_id: 10,
        opponent_id: undefined,
        opponent: undefined,
      }),
    ])

    await act(async () => {
      await result.current.handlePlayAgain()
    })

    expect(mockNavigate).toHaveBeenLastCalledWith('/games/connect4/45')

    vi.mocked(apiClient.getActiveGameRooms).mockResolvedValueOnce([])
    vi.mocked(apiClient.createGameRoom).mockResolvedValueOnce(
      buildRoom({ id: 46 })
    )

    await act(async () => {
      await result.current.handlePlayAgain()
    })

    expect(apiClient.createGameRoom).toHaveBeenCalledWith('connect4')
    expect(mockNavigate).toHaveBeenLastCalledWith('/games/connect4/46')
  })

  it('triggers victory blast + rematch dialog timer for finished win states', async () => {
    const { result } = renderCore()

    await waitFor(() => expect(result.current.coreState?.status).toBe('active'))
    vi.useFakeTimers()

    act(() => {
      latestOnAction?.({
        type: 'game_state',
        payload: {
          status: 'finished',
          winner_id: 10,
          next_turn: 20,
          is_draw: false,
          board: [[1]],
        },
      })
    })

    expect(result.current.showVictoryBlast).toBe(true)
    expect(playVictoryJingle).toHaveBeenCalled()
    expect(result.current.showRematchDialog).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VICTORY_BLAST_DURATION_MS)
    })

    expect(result.current.showVictoryBlast).toBe(false)
    expect(result.current.showRematchDialog).toBe(true)
  })

  it('navigates away when initial room query errors', async () => {
    vi.mocked(apiClient.getGameRoom).mockRejectedValueOnce(
      new Error('not found')
    )

    renderCore()

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Game not found')
      expect(mockNavigate).toHaveBeenCalledWith('/games')
    })
  })
})
