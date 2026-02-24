import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type {
  BanUserRequest,
  MuteChatroomUserRequest,
  ResolveModerationReportRequest,
} from '@/api/types'
import { handleAuthOrFKError } from '@/lib/handleAuthOrFKError'

export const adminModerationKeys = {
  all: ['admin-moderation'] as const,
  reports: (params?: {
    status?: string
    target_type?: string
    limit?: number
    offset?: number
  }) => [...adminModerationKeys.all, 'reports', params ?? {}] as const,
  banRequests: (params?: { offset?: number; limit?: number }) =>
    [...adminModerationKeys.all, 'ban-requests', params ?? {}] as const,
  users: (params?: { q?: string; offset?: number; limit?: number }) =>
    [...adminModerationKeys.all, 'users', params ?? {}] as const,
  userDetail: (userId: number) =>
    [...adminModerationKeys.all, 'users', userId] as const,
  roomMutes: (chatroomId: number) =>
    [...adminModerationKeys.all, 'room-mutes', chatroomId] as const,
}

export function useAdminReports(params?: {
  status?: string
  target_type?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: adminModerationKeys.reports(params),
    queryFn: () => apiClient.getAdminReports(params),
  })
}

export function useResolveAdminReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: ResolveModerationReportRequest
    }) => apiClient.resolveAdminReport(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...adminModerationKeys.all, 'reports'],
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useAdminBanRequests(params?: {
  offset?: number
  limit?: number
}) {
  return useQuery({
    queryKey: adminModerationKeys.banRequests(params),
    queryFn: () => apiClient.getAdminBanRequests(params),
  })
}

export function useAdminUsers(params?: {
  q?: string
  offset?: number
  limit?: number
}) {
  return useQuery({
    queryKey: adminModerationKeys.users(params),
    queryFn: () => apiClient.getAdminUsers(params),
  })
}

export function useAdminUserDetail(userId: number) {
  return useQuery({
    queryKey: adminModerationKeys.userDetail(userId),
    queryFn: () => apiClient.getAdminUserDetail(userId),
    enabled: userId > 0,
  })
}

export function useBanAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload?: BanUserRequest }) =>
      apiClient.banAdminUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...adminModerationKeys.all, 'users'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminModerationKeys.all, 'ban-requests'],
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useUnbanAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.unbanAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...adminModerationKeys.all, 'users'],
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useChatroomMutes(chatroomId: number) {
  return useQuery({
    queryKey: adminModerationKeys.roomMutes(chatroomId),
    queryFn: () => apiClient.getChatroomMutes(chatroomId),
    enabled: chatroomId > 0,
  })
}

export function useMuteChatroomUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: number
      payload: MuteChatroomUserRequest
    }) => apiClient.muteChatroomUser(chatroomId, userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminModerationKeys.roomMutes(chatroomId),
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useUnmuteChatroomUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.unmuteChatroomUser(chatroomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminModerationKeys.roomMutes(chatroomId),
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}
