import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SanctumRequestForm from '@/pages/SanctumRequestForm'

const mutateMock = vi.fn()
const hookState = {
  mutate: mutateMock,
  isError: false,
  isSuccess: false,
  isPending: false,
  error: null as unknown,
}

vi.mock('@/hooks/useSanctums', () => ({
  useCreateSanctumRequest: () => hookState,
}))

describe('SanctumRequestForm', () => {
  afterEach(() => {
    mutateMock.mockReset()
    hookState.isError = false
    hookState.isSuccess = false
    hookState.isPending = false
    hookState.error = null
  })

  it('marks all fields as required', () => {
    render(
      <MemoryRouter>
        <SanctumRequestForm />
      </MemoryRouter>
    )

    expect(screen.getByLabelText('Requested Name')).toBeRequired()
    expect(screen.getByLabelText('Requested Slug')).toBeRequired()
    expect(screen.getByLabelText('Reason')).toBeRequired()
  })

  it('submits with valid payload', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SanctumRequestForm />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText('Requested Name'), 'The QA Hall')
    await user.type(screen.getByLabelText('Requested Slug'), 'qa-hall')
    await user.type(screen.getByLabelText('Reason'), 'Needed for testing')
    await user.click(screen.getByRole('button', { name: 'Submit Request' }))

    expect(mutateMock).toHaveBeenCalledWith({
      requested_name: 'The QA Hall',
      requested_slug: 'qa-hall',
      reason: 'Needed for testing',
    })
  })

  it('renders success state', () => {
    hookState.isSuccess = true

    render(
      <MemoryRouter>
        <SanctumRequestForm />
      </MemoryRouter>
    )

    expect(screen.getByText(/Request submitted\./)).toBeInTheDocument()
  })

  it('renders error state', () => {
    hookState.isError = true
    hookState.error = new Error('duplicate')

    render(
      <MemoryRouter>
        <SanctumRequestForm />
      </MemoryRouter>
    )

    expect(screen.getByText(/Failed to submit request/)).toBeInTheDocument()
  })
})
