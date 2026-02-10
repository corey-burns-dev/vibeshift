import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { SanctumRequest } from '@/api/types'
import { useMySanctumRequests } from '@/hooks/useSanctums'
import MySanctumRequests from '@/pages/MySanctumRequests'

vi.mock('@/hooks/useSanctums', () => ({
  useMySanctumRequests: vi.fn(),
}))

const mockedUseMySanctumRequests = vi.mocked(useMySanctumRequests)

function request(status: SanctumRequest['status'], id: number): SanctumRequest {
  return {
    id,
    user_id: 1,
    requested_name: `Request ${id}`,
    requested_slug: `request-${id}`,
    reason: 'Because',
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('MySanctumRequests', () => {
  afterEach(() => {
    mockedUseMySanctumRequests.mockReset()
  })

  it('renders empty state', () => {
    mockedUseMySanctumRequests.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(
      <MemoryRouter>
        <MySanctumRequests />
      </MemoryRouter>
    )

    expect(screen.getByText('No requests yet.')).toBeInTheDocument()
  })

  it('renders multiple statuses', () => {
    mockedUseMySanctumRequests.mockReturnValue({
      data: [
        request('pending', 1),
        request('approved', 2),
        request('rejected', 3),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(
      <MemoryRouter>
        <MySanctumRequests />
      </MemoryRouter>
    )

    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('approved')).toBeInTheDocument()
    expect(screen.getByText('rejected')).toBeInTheDocument()
  })
})
