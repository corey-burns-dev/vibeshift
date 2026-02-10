import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type {
  AdminSanctumRequestActionResponse,
  AdminSanctumRequestStatus,
  CreateSanctumRequestInput,
  SanctumRequest,
} from '@/api/types'

export const sanctumKeys = {
  all: ['sanctums'] as const,
  list: () => [...sanctumKeys.all, 'list'] as const,
  detail: (slug: string) => [...sanctumKeys.all, 'detail', slug] as const,
  requests: () => [...sanctumKeys.all, 'requests'] as const,
  myRequests: () => [...sanctumKeys.requests(), 'me'] as const,
  adminRequests: (status: AdminSanctumRequestStatus) =>
    [...sanctumKeys.requests(), 'admin', status] as const,
}

export function useSanctums() {
  return useQuery({
    queryKey: sanctumKeys.list(),
    queryFn: () => apiClient.getSanctums(),
  })
}

export function useSanctum(slug: string) {
  return useQuery({
    queryKey: sanctumKeys.detail(slug),
    queryFn: () => apiClient.getSanctum(slug),
    enabled: Boolean(slug),
  })
}

export function useCreateSanctumRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateSanctumRequestInput) =>
      apiClient.createSanctumRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sanctumKeys.myRequests() })
    },
  })
}

export function useMySanctumRequests() {
  return useQuery({
    queryKey: sanctumKeys.myRequests(),
    queryFn: () => apiClient.getMySanctumRequests(),
  })
}

export function useAdminSanctumRequests(status: AdminSanctumRequestStatus) {
  return useQuery({
    queryKey: sanctumKeys.adminRequests(status),
    queryFn: () => apiClient.getAdminSanctumRequests(status),
  })
}

function invalidateAdminRequestCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  request: SanctumRequest
) {
  queryClient.invalidateQueries({ queryKey: sanctumKeys.myRequests() })
  queryClient.invalidateQueries({ queryKey: sanctumKeys.list() })
  queryClient.invalidateQueries({
    queryKey: sanctumKeys.adminRequests('pending'),
  })
  queryClient.invalidateQueries({
    queryKey: sanctumKeys.adminRequests(request.status),
  })
}

export function useApproveSanctumRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      review_notes,
    }: {
      id: number
      review_notes?: string
    }): Promise<AdminSanctumRequestActionResponse> =>
      apiClient.approveSanctumRequest(id, review_notes),
    onSuccess: data => {
      invalidateAdminRequestCaches(queryClient, data.request)
    },
  })
}

export function useRejectSanctumRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, review_notes }: { id: number; review_notes?: string }) =>
      apiClient.rejectSanctumRequest(id, review_notes),
    onSuccess: request => {
      invalidateAdminRequestCaches(queryClient, request)
    },
  })
}
