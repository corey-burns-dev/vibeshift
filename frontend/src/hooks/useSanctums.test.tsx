import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import {
  useAdminSanctumRequests,
  useApproveSanctumRequest,
  useCreateSanctumRequest,
  useMySanctumMemberships,
  useMySanctumRequests,
  useRejectSanctumRequest,
  useSanctum,
  useSanctums,
  useUpsertMySanctumMemberships,
} from '@/hooks/useSanctums'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getSanctums: vi.fn(),
    getSanctum: vi.fn(),
    getMySanctumRequests: vi.fn(),
    getMySanctumMemberships: vi.fn(),
    getAdminSanctumRequests: vi.fn(),
    createSanctumRequest: vi.fn(),
    upsertMySanctumMemberships: vi.fn(),
    approveSanctumRequest: vi.fn(),
    rejectSanctumRequest: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useSanctums hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSanctums', () => {
    it('fetches sanctum list', async () => {
      const list = [
        {
          id: 1,
          name: 'Atrium',
          slug: 'atrium',
          description: '',
          status: 'active',
          default_chat_room_id: 1,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getSanctums.mockResolvedValue(list as never)

      const { result } = renderHook(() => useSanctums(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(list)
    })
  })

  describe('useSanctum', () => {
    it('fetches single sanctum by slug', async () => {
      const sanctum = {
        id: 1,
        name: 'Atrium',
        slug: 'atrium',
        description: '',
        status: 'active',
        default_chat_room_id: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).getSanctum.mockResolvedValue(sanctum as never)

      const { result } = renderHook(() => useSanctum('atrium'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(sanctum)
      expect(vi.mocked(apiClient).getSanctum).toHaveBeenCalledWith('atrium')
    })

    it('does not fetch when slug is empty', () => {
      const { result } = renderHook(() => useSanctum(''), {
        wrapper: createWrapper(),
      })
      expect(result.current.isFetching).toBe(false)
      expect(vi.mocked(apiClient).getSanctum).not.toHaveBeenCalled()
    })
  })

  describe('useMySanctumRequests', () => {
    it('fetches my requests', async () => {
      const requests = [
        {
          id: 1,
          requested_by_user_id: 1,
          requested_name: 'New',
          requested_slug: 'new',
          reason: 'Test',
          status: 'pending' as const,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getMySanctumRequests.mockResolvedValue(
        requests as never
      )

      const { result } = renderHook(() => useMySanctumRequests(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(requests)
    })
  })

  describe('useMySanctumMemberships', () => {
    it('fetches my memberships', async () => {
      const memberships = [
        {
          sanctum_id: 1,
          user_id: 1,
          role: 'member' as const,
          created_at: '',
          updated_at: '',
          sanctum: {
            id: 1,
            name: 'Atrium',
            slug: 'atrium',
            description: '',
            status: 'active',
            default_chat_room_id: 1,
            created_at: '',
            updated_at: '',
          },
        },
      ]
      vi.mocked(apiClient).getMySanctumMemberships.mockResolvedValue(
        memberships as never
      )

      const { result } = renderHook(() => useMySanctumMemberships(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(memberships)
    })
  })

  describe('useAdminSanctumRequests', () => {
    it('fetches admin requests by status', async () => {
      const requests = [
        {
          id: 1,
          requested_by_user_id: 1,
          requested_name: 'New',
          requested_slug: 'new',
          reason: 'Test',
          status: 'pending' as const,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getAdminSanctumRequests.mockResolvedValue(
        requests as never
      )

      const { result } = renderHook(() => useAdminSanctumRequests('pending'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(vi.mocked(apiClient).getAdminSanctumRequests).toHaveBeenCalledWith(
        'pending'
      )
    })
  })

  describe('useCreateSanctumRequest', () => {
    it('calls API with payload', async () => {
      const created = {
        id: 1,
        requested_by_user_id: 1,
        requested_name: 'Hall',
        requested_slug: 'hall',
        reason: 'Need space',
        status: 'pending' as const,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).createSanctumRequest.mockResolvedValue(
        created as never
      )

      const { result } = renderHook(() => useCreateSanctumRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({
          requested_name: 'Hall',
          requested_slug: 'hall',
          reason: 'Need space',
        })
      })

      expect(vi.mocked(apiClient).createSanctumRequest).toHaveBeenCalledWith({
        requested_name: 'Hall',
        requested_slug: 'hall',
        reason: 'Need space',
      })
    })
  })

  describe('useUpsertMySanctumMemberships', () => {
    it('calls API with sanctum slugs', async () => {
      vi.mocked(apiClient).upsertMySanctumMemberships.mockResolvedValue(
        undefined as never
      )

      const { result } = renderHook(() => useUpsertMySanctumMemberships(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ sanctum_slugs: ['atrium', 'hall'] })
      })

      expect(
        vi.mocked(apiClient).upsertMySanctumMemberships
      ).toHaveBeenCalledWith({ sanctum_slugs: ['atrium', 'hall'] })
    })
  })

  describe('useApproveSanctumRequest', () => {
    it('calls API with id and optional review_notes', async () => {
      const response = {
        sanctum: {
          id: 1,
          name: 'Hall',
          slug: 'hall',
          description: '',
          status: 'active',
          default_chat_room_id: 1,
          created_at: '',
          updated_at: '',
        },
        request: {
          id: 1,
          requested_by_user_id: 1,
          requested_name: 'Hall',
          requested_slug: 'hall',
          reason: '',
          status: 'approved' as const,
          created_at: '',
          updated_at: '',
        },
      }
      vi.mocked(apiClient).approveSanctumRequest.mockResolvedValue(
        response as never
      )

      const { result } = renderHook(() => useApproveSanctumRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ id: 1, review_notes: 'Looks good' })
      })

      expect(vi.mocked(apiClient).approveSanctumRequest).toHaveBeenCalledWith(
        1,
        'Looks good'
      )
    })
  })

  describe('useRejectSanctumRequest', () => {
    it('calls API with id and optional review_notes', async () => {
      const request = {
        id: 1,
        requested_by_user_id: 1,
        requested_name: 'Hall',
        requested_slug: 'hall',
        reason: '',
        status: 'rejected' as const,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).rejectSanctumRequest.mockResolvedValue(
        request as never
      )

      const { result } = renderHook(() => useRejectSanctumRequest(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ id: 1 })
      })

      expect(vi.mocked(apiClient).rejectSanctumRequest).toHaveBeenCalledWith(
        1,
        undefined
      )
    })
  })
})
