// Stream hooks - using TanStack Query with the apiClient

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { CreateStreamRequest, UpdateStreamRequest } from '../api/types'

// Query keys
export const streamKeys = {
  all: ['streams'] as const,
  lists: () => [...streamKeys.all, 'list'] as const,
  list: (filters: { category?: string }) =>
    [...streamKeys.lists(), filters] as const,
  details: () => [...streamKeys.all, 'detail'] as const,
  detail: (id: number) => [...streamKeys.details(), id] as const,
  myStreams: () => [...streamKeys.all, 'my'] as const,
  categories: () => [...streamKeys.all, 'categories'] as const,
  messages: (id: number) => [...streamKeys.all, 'messages', id] as const,
}

// Get live streams
export function useStreams(category?: string) {
  return useQuery({
    queryKey: streamKeys.list({ category }),
    queryFn: () => apiClient.getStreams({ category, limit: 20 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

// Get single stream
export function useStream(id: number) {
  return useQuery({
    queryKey: streamKeys.detail(id),
    queryFn: () => apiClient.getStream(id),
    enabled: id > 0,
    refetchInterval: 10000, // Refresh every 10 seconds for viewer count
  })
}

// Get stream categories
export function useStreamCategories() {
  return useQuery({
    queryKey: streamKeys.categories(),
    queryFn: () => apiClient.getStreamCategories(),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  })
}

// Get my streams
export function useMyStreams() {
  return useQuery({
    queryKey: streamKeys.myStreams(),
    queryFn: () => apiClient.getMyStreams(),
  })
}

// Get stream messages
export function useStreamMessages(streamId: number) {
  return useQuery({
    queryKey: streamKeys.messages(streamId),
    queryFn: () => apiClient.getStreamMessages(streamId, { limit: 100 }),
    enabled: streamId > 0,
    refetchInterval: 5000, // Poll for new messages
  })
}

// Create stream
export function useCreateStream() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateStreamRequest) => apiClient.createStream(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: streamKeys.myStreams() })
    },
  })
}

// Update stream
export function useUpdateStream() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateStreamRequest }) =>
      apiClient.updateStream(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: streamKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: streamKeys.myStreams() })
    },
  })
}

// Delete stream
export function useDeleteStream() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => apiClient.deleteStream(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: streamKeys.lists() })
      queryClient.invalidateQueries({ queryKey: streamKeys.myStreams() })
    },
  })
}

// Go live
export function useGoLive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => apiClient.goLive(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: streamKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: streamKeys.lists() })
      queryClient.invalidateQueries({ queryKey: streamKeys.myStreams() })
    },
  })
}

// End stream
export function useEndStream() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => apiClient.endStream(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: streamKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: streamKeys.lists() })
      queryClient.invalidateQueries({ queryKey: streamKeys.myStreams() })
    },
  })
}

// Send stream message
export function useSendStreamMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      streamId,
      content,
    }: {
      streamId: number
      content: string
    }) => apiClient.sendStreamMessage(streamId, content),
    onSuccess: (_, { streamId }) => {
      queryClient.invalidateQueries({
        queryKey: streamKeys.messages(streamId),
      })
    },
  })
}
