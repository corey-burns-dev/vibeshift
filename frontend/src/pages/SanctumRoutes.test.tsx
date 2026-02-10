import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SanctumDTO } from '@/api/types'
import { useSanctum, useSanctums } from '@/hooks/useSanctums'
import SanctumDetail from '@/pages/SanctumDetail'
import Sanctums from '@/pages/Sanctums'

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: vi.fn(),
  useSanctum: vi.fn(),
}))

const mockedUseSanctums = vi.mocked(useSanctums)
const mockedUseSanctum = vi.mocked(useSanctum)

function makeSanctum(id: number, name: string, slug: string): SanctumDTO {
  return {
    id,
    name,
    slug,
    description: `${name} desc`,
    status: 'active',
    default_chat_room_id: id * 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('Sanctum routes', () => {
  afterEach(() => {
    mockedUseSanctums.mockReset()
    mockedUseSanctum.mockReset()
  })

  it('loads /sanctums list shell', () => {
    mockedUseSanctums.mockReturnValue({
      data: [makeSanctum(1, 'The Atrium', 'atrium')],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(
      <MemoryRouter initialEntries={['/sanctums']}>
        <Routes>
          <Route path="/sanctums" element={<Sanctums />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sanctums' })
    ).toBeInTheDocument()
    expect(screen.getAllByText('The Atrium').length).toBeGreaterThanOrEqual(1)
  })

  it('loads /s/:slug detail shell', () => {
    const all = [
      makeSanctum(1, 'The Atrium', 'atrium'),
      makeSanctum(2, 'The Forge', 'development'),
      makeSanctum(3, 'The Herald', 'herald'),
      makeSanctum(4, 'Sanctum Support', 'support'),
      makeSanctum(5, 'The Game Room', 'gaming'),
      makeSanctum(6, 'The Anime Hall', 'anime'),
      makeSanctum(7, 'The Silver Screen', 'movies'),
    ]

    mockedUseSanctums.mockReturnValue({
      data: all,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    mockedUseSanctum.mockReturnValue({
      data: makeSanctum(1, 'The Atrium', 'atrium'),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(
      <MemoryRouter initialEntries={['/s/atrium']}>
        <Routes>
          <Route path="/s/:slug" element={<SanctumDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'The Atrium' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Chat' })).toBeInTheDocument()
  })
})
