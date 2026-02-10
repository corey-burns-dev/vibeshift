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
]

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: () => ({
    data: sanctums,
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
  })

  it('forces Atrium and preselects Atrium + Forge + Game Room', () => {
    const { container } = render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    const atrium = container.querySelector(
      '#sanctum-atrium'
    ) as HTMLInputElement
    const forge = container.querySelector(
      '#sanctum-development'
    ) as HTMLInputElement
    const gameRoom = container.querySelector(
      '#sanctum-gaming'
    ) as HTMLInputElement
    const continueButton = screen.getByRole('button', { name: 'Continue' })

    expect(atrium.checked).toBe(true)
    expect(atrium.disabled).toBe(true)
    expect(forge.checked).toBe(true)
    expect(gameRoom.checked).toBe(true)
    expect(continueButton).toBeEnabled()
  })

  it('requires at least 3 sanctums before submit', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    const forge = container.querySelector('#sanctum-development')
    const gameRoom = container.querySelector('#sanctum-gaming')
    await user.click(forge as HTMLInputElement)
    await user.click(gameRoom as HTMLInputElement)

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('submits selected sanctums and redirects home', async () => {
    mutateAsyncMock.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <OnboardingSanctums />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      sanctum_slugs: ['atrium', 'development', 'gaming'],
    })
    expect(navigateMock).toHaveBeenCalledWith('/posts')
  })
})
