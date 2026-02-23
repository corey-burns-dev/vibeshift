import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useSanctum } from '@/hooks/useSanctums'
import SanctumFeed from '@/pages/SanctumFeed'

vi.mock('@/hooks/useSanctums', () => ({
  useSanctum: vi.fn(),
}))

vi.mock('@/pages/Posts', () => ({
  default: ({ sanctumId }: { sanctumId?: number }) => (
    <div>Sanctum posts for: {sanctumId}</div>
  ),
}))

const mockedUseSanctum = vi.mocked(useSanctum)

describe('SanctumFeed', () => {
  it('shows loading state', () => {
    mockedUseSanctum.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/s/atrium']}>
        <Routes>
          <Route path='/s/:slug' element={<SanctumFeed />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Loading sanctum...')).toBeInTheDocument()
  })

  it('shows error state', () => {
    const refetch = vi.fn()
    mockedUseSanctum.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never)

    render(
      <MemoryRouter initialEntries={['/s/atrium']}>
        <Routes>
          <Route path='/s/:slug' element={<SanctumFeed />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Failed to load sanctum feed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows not found state', () => {
    mockedUseSanctum.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/s/atrium']}>
        <Routes>
          <Route path='/s/:slug' element={<SanctumFeed />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Sanctum not found.')).toBeInTheDocument()
  })

  it('renders scoped posts feed when sanctum resolves', () => {
    mockedUseSanctum.mockReturnValue({
      data: {
        id: 42,
        name: 'The Atrium',
        slug: 'atrium',
        description: 'General',
      },
      isLoading: false,
      isError: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/s/atrium']}>
        <Routes>
          <Route path='/s/:slug' element={<SanctumFeed />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'The Atrium' })
    ).toBeInTheDocument()
    expect(screen.getByText('Sanctum posts for: 42')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/sanctums/atrium/manage'
    )
  })
})
