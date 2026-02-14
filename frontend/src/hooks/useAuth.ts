// Auth Hooks - using TanStack Query

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { LoginRequest, SignupRequest } from '../api/types'
import { resetClientSessionState } from '../lib/session-reset'
import { useAuthSessionStore } from '../stores/useAuthSessionStore'
import { resetChatDockSession } from '../stores/useChatDockStore'
import { clearCachedUser, getCurrentUser, userKeys } from './useUsers'

export function useSignup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SignupRequest) => apiClient.signup(data),
    onSuccess: data => {
      // Store user (token is handled by apiClient + AuthSessionStore)
      localStorage.setItem('user', JSON.stringify(data.user))
      clearCachedUser()
      resetChatDockSession({
        nextUserID: data.user.id,
        clearPersisted: false,
      })

      // Invalidate any cached user data
      queryClient.setQueryData(userKeys.me(), data.user)
      queryClient.invalidateQueries({ queryKey: userKeys.me() })

      navigate('/onboarding/sanctums')
    },
  })
}

export function useLogin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: LoginRequest) => apiClient.login(data),
    onSuccess: data => {
      // Store user (token is handled by apiClient + AuthSessionStore)
      localStorage.setItem('user', JSON.stringify(data.user))
      clearCachedUser()
      resetChatDockSession({
        nextUserID: data.user.id,
        clearPersisted: false,
      })

      // Invalidate any cached user data
      queryClient.setQueryData(userKeys.me(), data.user)
      queryClient.invalidateQueries({ queryKey: userKeys.me() })

      // Navigate to posts
      navigate('/posts')
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return async () => {
    const previousUserID = getCurrentUser()?.id ?? null

    try {
      // Call backend logout (handles store + user cleanup in apiClient)
      await apiClient.logout()
    } finally {
      resetClientSessionState({
        previousUserID,
        nextUserID: null,
        clearAuth: true,
      })

      // Clear all cached queries
      queryClient.clear()

      // Navigate to login
      navigate('/login')
    }
  }
}
export function getAuthToken(): string | null {
  return useAuthSessionStore.getState().accessToken
}

export function useAuthToken(): string | null {
  return useAuthSessionStore(state => state.accessToken)
}
