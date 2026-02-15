import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Login from '@/pages/Login'

const mutateAsync = vi.fn()
vi.mock('@/hooks', () => ({
  useLogin: () => ({
    mutateAsync,
    isPending: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('submits with email and password', async () => {
    mutateAsync.mockResolvedValue(undefined)

    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await expect(mutateAsync).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123!',
    })
  })

  it('shows validation for empty submit', async () => {
    renderLogin()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
  })

  it('shows zod validation error for short password', async () => {
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'valid@example.com')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Password must be at least 6 characters')
    ).toBeInTheDocument()
  })
})
