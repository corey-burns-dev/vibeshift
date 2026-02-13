// Auth Hooks - using TanStack Query

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { LoginRequest, SignupRequest } from '../api/types'
import { useAuthSessionStore } from '../stores/useAuthSessionStore'
import { useChatDockStore } from '../stores/useChatDockStore'

export function useSignup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SignupRequest) => apiClient.signup(data),
    onSuccess: data => {
      // Store user (token is handled by apiClient + AuthSessionStore)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Invalidate any cached user data
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })

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

      // Invalidate any cached user data
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })

      // Navigate to posts
      navigate('/posts')
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return async () => {
    // Clear chat dock state
    useChatDockStore.getState().clearOpenConversations()

    // Call backend logout (handles store + user cleanup in apiClient)
    await apiClient.logout()

    // Clear all cached queries
    queryClient.clear()

    // Navigate to login
    navigate('/login')
  }
}
export function getAuthToken(): string | null {
  return useAuthSessionStore.getState().accessToken
}

export function useAuthToken(): string | null {
  return useAuthSessionStore(state => state.accessToken)
}
