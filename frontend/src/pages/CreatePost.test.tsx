import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreatePost } from '@/hooks/usePosts'
import { useSanctums } from '@/hooks/useSanctums'
import { getCurrentUser } from '@/hooks/useUsers'
import CreatePost from '@/pages/CreatePost'

const navigateMock = vi.fn()
const mutateAsyncMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/hooks/usePosts', () => ({
  useCreatePost: vi.fn(),
}))

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: vi.fn(),
}))

vi.mock('@/hooks/useUsers', () => ({
  getCurrentUser: vi.fn(),
}))

describe('CreatePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCreatePost).mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    } as never)
    vi.mocked(useSanctums).mockReturnValue({
      data: [
        {
          id: 1,
          name: 'The Atrium',
          slug: 'atrium',
          description: 'Core room',
          status: 'active',
          default_chat_room_id: 1,
          created_at: '',
          updated_at: '',
        },
      ],
    } as never)
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 7,
      username: 'alice',
      email: 'alice@example.com',
      created_at: '',
      updated_at: '',
    } as never)
  })

  it('creates a main-feed text post without sanctum_id', async () => {
    mutateAsyncMock.mockResolvedValue({ id: 42 })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <CreatePost />
      </MemoryRouter>
    )

    await user.type(screen.getByPlaceholderText('Write your post...'), 'Hello')
    await user.click(screen.getByRole('button', { name: /create post/i }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          post_type: 'text',
          content: 'Hello',
          sanctum_id: undefined,
        })
      )
    })
    expect(navigateMock).toHaveBeenCalledWith('/posts/42')
  })

  it('creates a sanctum post with sanctum_id when selected', async () => {
    mutateAsyncMock.mockResolvedValue({ id: 99 })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <CreatePost />
      </MemoryRouter>
    )

    await user.selectOptions(screen.getByLabelText('Post destination'), ['1'])
    await user.type(screen.getByPlaceholderText('Write your post...'), 'Scoped')
    await user.click(screen.getByRole('button', { name: /create post/i }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          post_type: 'text',
          content: 'Scoped',
          sanctum_id: 1,
        })
      )
    })
  })
})
