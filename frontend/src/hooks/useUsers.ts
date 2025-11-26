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
  const cachedUser = getCurrentUser()

  return useQuery({
    queryKey: userKeys.me(),
    queryFn: () => apiClient.getMyProfile(),
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      const isAuthError =
        error?.message?.includes('401') ||
        error?.message?.includes('403') ||
        error?.message?.includes('Unauthorized') ||
        error?.message?.includes('Forbidden')
      return !isAuthError && failureCount < 2
    },
    // Use cached data as initial data
    initialData: cachedUser ? cachedUser : undefined,
    // Keep previous data while fetching new data
    keepPreviousData: true,
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
        localStorage.setItem(
          'user',
          JSON.stringify({
            ...previousUser,
            ...newData,
          })
        )
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

// Check if user is authenticated (with basic token validation)
export function useIsAuthenticated(): boolean {
  const token = localStorage.getItem('token')
  if (!token) return false

  try {
    // Basic JWT validation - check if token is not expired
    const payload = JSON.parse(atob(token.split('.')[1]))
    const currentTime = Date.now() / 1000
    return payload.exp > currentTime
  } catch {
    // If token parsing fails, consider it invalid
    return false
  }
}

// Validate token by making a test API call
export function useValidateToken() {
  return useQuery({
    queryKey: ['auth', 'validate'],
    queryFn: async () => {
      try {
        await apiClient.healthCheck()
        return true
      } catch (error) {
        // If health check fails with auth error, token is invalid
        const isAuthError =
          error?.message?.includes('401') ||
          error?.message?.includes('403') ||
          error?.message?.includes('Unauthorized') ||
          error?.message?.includes('Forbidden')
        if (isAuthError) {
          // Clear invalid token
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          return false
        }
        // If it's a different error (network, server), assume token is still valid
        return true
      }
    },
    enabled: !!localStorage.getItem('token'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  })
}
