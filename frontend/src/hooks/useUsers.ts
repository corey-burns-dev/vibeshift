// User Hooks - using TanStack Query

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ApiError, apiClient } from '../api/client'
import type { UpdateProfileRequest, User } from '../api/types'
import { useAuthSessionStore } from '../stores/useAuthSessionStore'

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
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        return false
      }
      const err = error as Error
      const isAuthError =
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('Forbidden')
      return !isAuthError && failureCount < 2
    },
    // Use cached data as initial data
    initialData: cachedUser ? cachedUser : undefined,
    // Keep previous data while fetching new data
    placeholderData: keepPreviousData,
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

// Get all users (for community sidebar)
export function useAllUsers() {
  return useQuery({
    queryKey: [...userKeys.all, 'list'],
    queryFn: () => apiClient.getUsers({ limit: 100 }),
  })
}

// Update current user profile
export function useUpdateMyProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => apiClient.updateMyProfile(data),
    onMutate: async newData => {
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

        // Also update localStorage + cache
        const merged = { ...previousUser, ...newData }
        localStorage.setItem('user', JSON.stringify(merged))
        cachedUser = merged as User
        cachedUserRaw = localStorage.getItem('user')
      }

      return { previousUser }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousUser) {
        queryClient.setQueryData(userKeys.me(), context.previousUser)
        localStorage.setItem('user', JSON.stringify(context.previousUser))
        cachedUser = context.previousUser
        cachedUserRaw = localStorage.getItem('user')
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    },
  })
}

// Cached current user to avoid repeated localStorage reads + JSON.parse
let cachedUser: User | null = null
let cachedUserRaw: string | null = null

function parseUser(userStr: string | null): User | null {
  if (!userStr) return null
  try {
    return JSON.parse(userStr) as User
  } catch {
    return null
  }
}

// Get current user from localStorage (synchronous)
export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('user')
  if (userStr === cachedUserRaw) return cachedUser
  cachedUserRaw = userStr
  cachedUser = parseUser(userStr)
  return cachedUser
}

export function clearCachedUser() {
  cachedUser = null
  cachedUserRaw = null
}

// Check if user is authenticated (with basic token validation)
export function useIsAuthenticated(): boolean {
  const token = useAuthSessionStore(state => state.accessToken)
  if (!token) return false

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    // Basic JWT validation - check if token is not expired
    const payload = JSON.parse(atob(parts[1]))
    const currentTime = Date.now() / 1000
    return payload.exp > currentTime
  } catch {
    // If token parsing fails, consider it invalid
    return false
  }
}

// Validate token by making a test API call
export function useValidateToken() {
  const token = useAuthSessionStore(state => state.accessToken)

  return useQuery({
    queryKey: ['auth', 'validate', token?.slice(-8)],
    queryFn: async () => {
      try {
        await apiClient.getCurrentUser()
        return true
      } catch (error) {
        const isAuthError =
          (error instanceof ApiError &&
            (error.status === 401 || error.status === 403)) ||
          (error instanceof Error &&
            (error.message.includes('Unauthorized') ||
              error.message.includes('Forbidden')))
        if (isAuthError) {
          // Clear invalid session
          useAuthSessionStore.getState().clear()
          localStorage.removeItem('user')
          clearCachedUser()
          return false
        }
        // If it's a different error (network, server), assume token is still valid
        return true
      }
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
