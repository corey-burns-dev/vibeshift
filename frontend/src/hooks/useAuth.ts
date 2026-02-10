// Auth Hooks - using TanStack Query

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { LoginRequest, SignupRequest } from '../api/types'

export function useSignup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SignupRequest) => apiClient.signup(data),
    onSuccess: data => {
      // Store token and user
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Invalidate any cached user data
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })

      // TODO(onboarding/sanctums): switch to `/onboarding/sanctums` after signup
      // once backend exposes Sanctum follow/join endpoints.
      navigate('/posts')
    },
  })
}

export function useLogin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: LoginRequest) => apiClient.login(data),
    onSuccess: data => {
      // Store token and user
      localStorage.setItem('token', data.token)
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

  return () => {
    // Clear local storage
    localStorage.removeItem('token')
    localStorage.removeItem('user')

    // Clear all cached queries
    queryClient.clear()

    // Navigate to login
    navigate('/login')
  }
}
export function getAuthToken(): string | null {
  return localStorage.getItem('token')
}
