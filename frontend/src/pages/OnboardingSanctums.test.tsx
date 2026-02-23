import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnboardingSanctums from '@/pages/OnboardingSanctums'

const navigateMock = vi.fn()
const mutateAsyncMock = vi.fn()
const useIsMobileMock = vi.fn(() => false)

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
  useIsMobile: () => useIsMobileMock(),
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
    useIsMobileMock.mockReturnValue(false)
    sanctumsData = sanctums
  })

  it('starts with no sanctums selected and keeps continue enabled', () => {
    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    sanctums.forEach(sanctum => {
      expect(
        screen.getByRole('checkbox', { name: `Toggle ${sanctum.name}` })
      ).toHaveAttribute('aria-checked', 'false')
    })
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Toggle The Atrium' })
    )
    await user.click(screen.getByRole('checkbox', { name: 'Toggle The Forge' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Toggle The Game Room' })
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      sanctum_slugs: ['atrium', 'development', 'gaming'],
    })
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  it('shows pagination controls on mobile and changes visible cards', async () => {
    useIsMobileMock.mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByText('The Game Room')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByText('The Game Room')).toBeInTheDocument()
  })
})
