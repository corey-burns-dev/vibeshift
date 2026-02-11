import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useSanctums as useSanctumsHook } from '@/hooks/useSanctums'
import Sanctums from '@/pages/Sanctums'
import { buildSanctum } from '@/test/test-utils'

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: vi.fn(),
}))

function renderSanctums() {
  return render(
    <MemoryRouter>
      <Sanctums />
    </MemoryRouter>
  )
}

describe('Sanctums', () => {
  it('shows loading state', () => {
    vi.mocked(useSanctumsHook).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never)

    renderSanctums()
    expect(screen.getByText('Loading sanctums...')).toBeInTheDocument()
  })

  it('shows error state with Retry', () => {
    vi.mocked(useSanctumsHook).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as never)

    renderSanctums()
    expect(screen.getByText('Failed to load sanctums.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders sanctum list and links', () => {
    const sanctums = [
      buildSanctum({ id: 1, name: 'Atrium', slug: 'atrium' }),
      buildSanctum({ id: 2, name: 'Hall', slug: 'hall' }),
    ]
    vi.mocked(useSanctumsHook).mockReturnValue({
      data: sanctums,
      isLoading: false,
      isError: false,
    } as never)

    renderSanctums()
    expect(screen.getAllByText(/Atrium/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Hall/).length).toBeGreaterThan(0)
    const links = screen.getAllByRole('link')
    const atriumLink = links.find(l => l.getAttribute('href') === '/s/atrium')
    expect(atriumLink).toBeDefined()
  })
})
