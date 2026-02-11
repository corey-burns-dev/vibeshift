import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Signup from '@/pages/Signup'

const mutateAsync = vi.fn()
vi.mock('@/hooks', () => ({
  useSignup: () => ({
    mutateAsync,
    isPending: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderSignup() {
  return render(
    <MemoryRouter>
      <Signup />
    </MemoryRouter>
  )
}

describe('Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders username, email, password fields', () => {
    renderSignup()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('submits with valid data', async () => {
    mutateAsync.mockResolvedValue(undefined)

    renderSignup()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), 'johndoe')
    await user.type(screen.getByLabelText('Email'), 'john@example.com')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    const confirm = screen.getByLabelText(/confirm password/i)
    await user.type(confirm, 'Password123!')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      username: 'johndoe',
      email: 'john@example.com',
      password: 'Password123!',
    })
  })
})
