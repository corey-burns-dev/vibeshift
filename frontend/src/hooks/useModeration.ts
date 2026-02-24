import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { PaginationParams, ReportRequest } from '@/api/types'
import { handleAuthOrFKError } from '@/lib/handleAuthOrFKError'
import { chatKeys } from './useChat'

export const moderationKeys = {
  all: ['moderation'] as const,
  mentions: (params?: PaginationParams) =>
    [...moderationKeys.all, 'mentions', params ?? {}] as const,
  blocks: () => [...moderationKeys.all, 'blocks'] as const,
}

export function useMyMentions(params?: PaginationParams) {
  return useQuery({
    queryKey: moderationKeys.mentions(params),
    queryFn: () => apiClient.getMyMentions(params),
    retry: false,
  })
}

export function useMyBlocks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: moderationKeys.blocks(),
    queryFn: () => apiClient.getMyBlocks(),
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

export function useBlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => apiClient.blockUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moderationKeys.blocks() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useUnblockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => apiClient.unblockUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moderationKeys.blocks() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useReportPost() {
  return useMutation({
    mutationFn: ({
      postId,
      payload,
    }: {
      postId: number
      payload: ReportRequest
    }) => apiClient.reportPost(postId, payload),
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useReportMessage() {
  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
      payload,
    }: {
      conversationId: number
      messageId: number
      payload: ReportRequest
    }) => apiClient.reportMessage(conversationId, messageId, payload),
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useReportUser() {
  return useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: number
      payload: ReportRequest
    }) => apiClient.reportUser(userId, payload),
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}
