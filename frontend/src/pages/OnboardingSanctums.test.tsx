import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnboardingSanctums from '@/pages/OnboardingSanctums'

const navigateMock = vi.fn()
const mutateAsyncMock = vi.fn()

const sanctums = [
  {
    id: 1,
    name: 'The Atrium',
    slug: 'atrium',
    description: 'Core',
    status: 'active',
    default_chat_room_id: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    name: 'The Forge',
    slug: 'development',
    description: 'Dev',
    status: 'active',
    default_chat_room_id: 2,
    created_at: '',
    updated_at: '',
  },
  {
    id: 3,
    name: 'The Game Room',
    slug: 'gaming',
    description: 'Games',
    status: 'active',
    default_chat_room_id: 3,
    created_at: '',
    updated_at: '',
  },
  {
    id: 4,
    name: 'The Anime Hall',
    slug: 'anime',
    description: 'Anime',
    status: 'active',
    default_chat_room_id: 4,
    created_at: '',
    updated_at: '',
  },
  {
    id: 5,
    name: 'Movies',
    slug: 'movies',
    description: 'Movies',
    status: 'active',
    default_chat_room_id: 5,
    created_at: '',
    updated_at: '',
  },
]

let sanctumsData = sanctums

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: () => ({
    data: sanctumsData,
    isLoading: false,
    isError: false,
  }),
  useUpsertMySanctumMemberships: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

describe('OnboardingSanctums', () => {
  afterEach(() => {
    mutateAsyncMock.mockReset()
    navigateMock.mockReset()
    sanctumsData = sanctums
  })

  it('starts with no sanctums selected and keeps continue enabled', () => {
    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    expect(screen.getAllByRole('button', { name: '+ Join' })).toHaveLength(
      sanctums.length
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('lets users toggle sanctums by clicking full capsule and submits exact selected list', async () => {
    mutateAsyncMock.mockResolvedValue([])
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    // Cards are sorted alphabetically: Movies, Anime, Atrium, Forge, Game Room.
    const joinButtons = screen.getAllByRole('button', { name: '+ Join' })
    await user.click(joinButtons[2]!)
    await user.click(joinButtons[3]!)
    await user.click(joinButtons[4]!)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      sanctum_slugs: ['atrium', 'development', 'gaming'],
    })
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  it('shows all sanctums without pagination controls', () => {
    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    expect(
      screen.queryByRole('button', { name: 'Next' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Previous' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('The Game Room')).toBeInTheDocument()
  })
})
