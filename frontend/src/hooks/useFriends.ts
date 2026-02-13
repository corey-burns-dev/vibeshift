import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '../api/client'
import { handleAuthOrFKError } from '../lib/handleAuthOrFKError'

// Query keys
export const friendKeys = {
  all: ['friends'] as const,
  lists: () => [...friendKeys.all, 'list'] as const,
  requests: () => [...friendKeys.all, 'requests'] as const,
  incomingRequests: () => [...friendKeys.requests(), 'incoming'] as const,
  outgoingRequests: () => [...friendKeys.requests(), 'outgoing'] as const,
  status: (userId: number) => [...friendKeys.all, 'status', userId] as const,
}

// Get friends list
export function useFriends(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: friendKeys.lists(),
    queryFn: () => apiClient.getFriends(),
    enabled: options?.enabled ?? true,
  })
}

// Get incoming friend requests
export function usePendingRequests() {
  return useQuery({
    queryKey: friendKeys.incomingRequests(),
    queryFn: () => apiClient.getPendingRequests(),
  })
}

// Get outgoing friend requests
export function useSentRequests() {
  return useQuery({
    queryKey: friendKeys.outgoingRequests(),
    queryFn: () => apiClient.getSentRequests(),
  })
}

// Get friendship status with a specific user
export function useFriendshipStatus(
  userId: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: friendKeys.status(userId),
    queryFn: () => apiClient.getFriendshipStatus(userId),
    enabled: !!userId && (options?.enabled ?? true),
  })
}

// Send friend request
export function useSendFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: number) => apiClient.sendFriendRequest(userId),
    onSuccess: (_, userId) => {
      toast.success('Friend request sent')
      queryClient.invalidateQueries({
        queryKey: friendKeys.incomingRequests(),
      })
      queryClient.invalidateQueries({
        queryKey: friendKeys.outgoingRequests(),
      })
      queryClient.invalidateQueries({ queryKey: friendKeys.lists() })
      queryClient.invalidateQueries({ queryKey: friendKeys.status(userId) })
      queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
    onError: error => {
      handleAuthOrFKError(error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to send friend request'
      )
    },
  })
}

// Accept friend request
export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (requestId: number) => apiClient.acceptFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: friendKeys.incomingRequests(),
      })
      queryClient.invalidateQueries({ queryKey: friendKeys.lists() })
      // Invalidate status for all potentially affected users (simplification)
      // Ideally we'd know the userId here too, but the API response might not contain it
      // We can iterate or just invalidate all status queries if needed, or rely on future refetches
      queryClient.invalidateQueries({ queryKey: friendKeys.all })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Reject friend request
export function useRejectFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (requestId: number) => apiClient.rejectFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: friendKeys.incomingRequests(),
      })
      queryClient.invalidateQueries({ queryKey: friendKeys.all }) // Update statuses
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Remove friend
export function useRemoveFriend() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: number) => apiClient.removeFriend(userId),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.lists() })
      queryClient.invalidateQueries({ queryKey: friendKeys.status(userId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}
