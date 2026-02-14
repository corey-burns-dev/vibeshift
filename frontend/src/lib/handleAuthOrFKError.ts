import { toast } from 'sonner'
import { resetClientSessionState } from './session-reset'

// Shared handler for auth/foreign key errors in mutations
export function handleAuthOrFKError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false

  const status = (error as { status?: number }).status

  // Only treat 401 as session death. 403 is authorization, not authentication.
  if (status === 401) {
    resetClientSessionState({
      nextUserID: null,
      clearAuth: true,
    })
    toast.error('Your session has expired. Please log in again.')
    window.location.href = '/login'
    return true
  }

  // Foreign key constraint = user was deleted, treat as session death
  const msg = (error as { message?: string }).message ?? ''
  if (msg.includes('foreign key constraint')) {
    resetClientSessionState({
      nextUserID: null,
      clearAuth: true,
    })
    toast.error('Your user no longer exists. Please log in again.')
    window.location.href = '/login'
    return true
  }

  return false
}
