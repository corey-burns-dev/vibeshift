// User Hooks - using TanStack Query

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { UpdateProfileRequest, User } from '../api/types'

// Query keys
export const userKeys = {
  all: ['users'] as const,
  me: () => [...userKeys.all, 'me'] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: number) => [...userKeys.details(), id] as const,
}

// Get current user profile
export function useMyProfile() {
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: () => apiClient.getMyProfile(),
    retry: false, // Don't retry if not authenticated
  })
}

// Get user profile by ID
export function useUserProfile(id: number) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => apiClient.getUserProfile(id),
    enabled: !!id,
  })
}

// Update current user profile
export function useUpdateMyProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => apiClient.updateMyProfile(data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: userKeys.me() })

      // Snapshot previous value
      const previousUser = queryClient.getQueryData<User>(userKeys.me())

      // Optimistically update
      if (previousUser) {
        queryClient.setQueryData<User>(userKeys.me(), {
          ...previousUser,
          ...newData,
        })
        
        // Also update localStorage
        localStorage.setItem('user', JSON.stringify({
          ...previousUser,
          ...newData,
        }))
      }

      return { previousUser }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousUser) {
        queryClient.setQueryData(userKeys.me(), context.previousUser)
        localStorage.setItem('user', JSON.stringify(context.previousUser))
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    },
  })
}

// Get current user from localStorage (synchronous)
export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

// Check if user is authenticated
export function useIsAuthenticated(): boolean {
  const token = localStorage.getItem('token')
  return !!token
}
