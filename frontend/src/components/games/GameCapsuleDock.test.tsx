import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_ROOM_REALTIME_EVENT } from '@/lib/game-realtime-events'
import { GameCapsuleDock } from './GameCapsuleDock'

const invalidateQueriesMock = vi.fn()
const useQueriesMock = vi.fn(
  ({ queries }: { queries: Array<Record<string, unknown>> }) =>
    queries.map(() => ({
      status: 'pending',
      data: null,
      error: null,
    }))
)

vi.mock('@tanstack/react-query', () => ({
  useQueries: (args: { queries: Array<Record<string, unknown>> }) =>
    useQueriesMock(args),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/feed' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/useUsers', () => ({
  useIsAuthenticated: () => true,
  getCurrentUser: () => ({ id: 42 }),
}))

vi.mock('@/lib/game-room-presence', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    getResumableGameRooms: vi.fn(() => [
      {
        roomId: 77,
        type: 'connect4',
        status: 'active',
        updatedAt: Date.now(),
      },
    ]),
  }
})

describe('GameCapsuleDock realtime updates', () => {
  beforeEach(() => {
    invalidateQueriesMock.mockReset()
    useQueriesMock.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not configure polling intervals for capsule queries', async () => {
    render(<GameCapsuleDock />)

    await waitFor(() => {
      expect(useQueriesMock).toHaveBeenCalled()
    })

    const latestCall = useQueriesMock.mock.calls.at(-1)?.[0] as {
      queries: Array<Record<string, unknown>>
    }

    expect(latestCall.queries).toHaveLength(1)
    expect(latestCall.queries[0].refetchInterval).toBeUndefined()
    expect(latestCall.queries[0].refetchIntervalInBackground).toBeUndefined()
  })

  it('invalidates only tracked room query on targeted realtime update', async () => {
    render(<GameCapsuleDock />)

    await waitFor(() => {
      expect(useQueriesMock).toHaveBeenCalled()
    })

    window.dispatchEvent(
      new CustomEvent(GAME_ROOM_REALTIME_EVENT, {
        detail: { roomId: 77 },
      })
    )

    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: ['gameRoomCapsule', 77],
      })
    })
  })

  it('invalidates all capsule queries on global realtime refresh event', async () => {
    render(<GameCapsuleDock />)

    await waitFor(() => {
      expect(useQueriesMock).toHaveBeenCalled()
    })

    window.dispatchEvent(
      new CustomEvent(GAME_ROOM_REALTIME_EVENT, {
        detail: {},
      })
    )

    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: ['gameRoomCapsule'],
      })
    })
  })
})
