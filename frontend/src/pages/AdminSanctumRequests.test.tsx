import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { getCurrentUser as getCurrentUserHook } from '@/hooks'
import { useAdminSanctumRequests as useAdminSanctumRequestsHook } from '@/hooks/useSanctums'
import AdminSanctumRequests from '@/pages/AdminSanctumRequests'
import { buildSanctumRequest, buildUser } from '@/test/test-utils'

vi.mock('@/hooks', () => ({
  getCurrentUser: vi.fn(),
}))
vi.mock('@/hooks/useSanctums', () => ({
  useAdminSanctumRequests: vi.fn(),
  useApproveSanctumRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectSanctumRequest: () => ({ mutate: vi.fn(), isPending: false }),
}))

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AdminSanctumRequests />
    </MemoryRouter>
  )
}

describe('AdminSanctumRequests', () => {
  it('redirects to /sanctums when user is not admin', () => {
    vi.mocked(getCurrentUserHook).mockReturnValue(
      buildUser({ id: 1, username: 'u', is_admin: false })
    )
    vi.mocked(useAdminSanctumRequestsHook).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never)

    renderAdmin()

    expect(screen.queryByText('Admin Sanctum Requests')).not.toBeInTheDocument()
  })

  it('renders admin UI when user is admin', () => {
    vi.mocked(getCurrentUserHook).mockReturnValue(
      buildUser({ id: 1, username: 'admin', is_admin: true })
    )
    vi.mocked(useAdminSanctumRequestsHook).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never)

    renderAdmin()

    expect(screen.getByText('Admin Sanctum Requests')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pending' })).toBeInTheDocument()
  })

  it('renders request list when data present', () => {
    vi.mocked(getCurrentUserHook).mockReturnValue(
      buildUser({ id: 1, username: 'admin', is_admin: true })
    )
    const requests = [
      buildSanctumRequest({
        id: 1,
        requested_name: 'New Space',
        requested_slug: 'new-space',
        status: 'pending',
      }),
    ]
    vi.mocked(useAdminSanctumRequestsHook).mockReturnValue({
      data: requests,
      isLoading: false,
      isError: false,
    } as never)

    renderAdmin()

    expect(screen.getByText('New Space')).toBeInTheDocument()
  })
})
