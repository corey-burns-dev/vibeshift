import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import type { SanctumDTO } from '@/api/types'
import { useIsAuthenticated } from '@/hooks'
import {
  useDemoteSanctumAdmin,
  useMySanctumMemberships,
  usePromoteSanctumAdmin,
  useSanctum,
  useSanctumAdmins,
  useSanctums,
} from '@/hooks/useSanctums'
import SanctumDetail from '@/pages/SanctumDetail'
import SanctumFeed from '@/pages/SanctumFeed'
import Sanctums from '@/pages/Sanctums'

vi.mock('@/hooks/useSanctums', () => ({
  useSanctums: vi.fn(),
  useSanctum: vi.fn(),
  useMySanctumMemberships: vi.fn(),
  useSanctumAdmins: vi.fn(),
  usePromoteSanctumAdmin: vi.fn(),
  useDemoteSanctumAdmin: vi.fn(),
  useUpsertMySanctumMemberships: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return {
    ...actual,
    useIsAuthenticated: vi.fn(),
  }
})

vi.mock('@/api/client', () => ({
  apiClient: {
    getPosts: vi.fn(),
  },
}))

vi.mock('@/pages/Posts', () => ({
  default: ({ sanctumId }: { sanctumId?: number }) => (
    <div>Posts scoped to {sanctumId}</div>
  ),
}))

const mockedUseSanctums = vi.mocked(useSanctums)
const mockedUseSanctum = vi.mocked(useSanctum)
const mockedUseMyMemberships = vi.mocked(useMySanctumMemberships)
const mockedUseSanctumAdmins = vi.mocked(useSanctumAdmins)
const mockedUsePromoteAdmin = vi.mocked(usePromoteSanctumAdmin)
const mockedUseDemoteAdmin = vi.mocked(useDemoteSanctumAdmin)
const mockedUseIsAuthenticated = vi.mocked(useIsAuthenticated)
const mockedGetPosts = vi.mocked(apiClient.getPosts)

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
    mockedUseMyMemberships.mockReset()
    mockedUseSanctumAdmins.mockReset()
    mockedUsePromoteAdmin.mockReset()
    mockedUseDemoteAdmin.mockReset()
    mockedUseIsAuthenticated.mockReset()
    mockedGetPosts.mockReset()
  })

  it('loads /sanctums list shell', () => {
    mockedUseIsAuthenticated.mockReturnValue(true)
    mockedUseSanctums.mockReturnValue({
      data: [makeSanctum(1, 'The Atrium', 'atrium')],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUseMyMemberships.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUseSanctumAdmins.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUsePromoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    mockedUseDemoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/sanctums']}>
        <Routes>
          <Route path='/sanctums' element={<Sanctums />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sanctums' })
    ).toBeInTheDocument()
    expect(screen.getAllByText('The Atrium').length).toBeGreaterThanOrEqual(1)
  })

  it('loads /s/:slug feed shell', async () => {
    mockedUseIsAuthenticated.mockReturnValue(true)
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
    mockedUseMyMemberships.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUseSanctumAdmins.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUsePromoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    mockedUseDemoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
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
    expect(screen.getByText('Posts scoped to 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
    expect(mockedGetPosts).not.toHaveBeenCalled()
  })

  it('loads /sanctums/:slug/manage legacy detail shell', async () => {
    mockedUseIsAuthenticated.mockReturnValue(true)
    const all = [
      makeSanctum(1, 'The Atrium', 'atrium'),
      makeSanctum(2, 'The Forge', 'development'),
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
    mockedUseMyMemberships.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUseSanctumAdmins.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    mockedUsePromoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    mockedUseDemoteAdmin.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    mockedGetPosts.mockResolvedValue([
      {
        id: 100,
        title: 'Atrium Update',
        content: 'Only this sanctum',
      },
    ] as never)

    render(
      <MemoryRouter initialEntries={['/sanctums/atrium/manage']}>
        <Routes>
          <Route path='/sanctums/:slug/manage' element={<SanctumDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('button', { name: 'Open Chat' })
    ).toBeInTheDocument()
    expect(await screen.findByText('Atrium Update')).toBeInTheDocument()
    expect(mockedGetPosts).toHaveBeenCalledWith({
      sanctum_id: 1,
      limit: 40,
      offset: 0,
    })
  })
})
