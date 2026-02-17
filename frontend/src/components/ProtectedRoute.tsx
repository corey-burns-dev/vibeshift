import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated, useValidateToken } from '@/hooks/useUsers'
import { logger } from '@/lib/logger'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const hasHydrated = useAuthSessionStore(s => s._hasHydrated)
  const isAuthenticated = useIsAuthenticated()
  const { data: tokenValid, isLoading, error, refetch } = useValidateToken()
  const location = useLocation()
  const clearAuth = useAuthSessionStore(s => s.clear)

  // Log state transitions for debugging
  useEffect(() => {
    if (!hasHydrated) {
      logger.debug('ProtectedRoute: waiting for hydration...')
    } else if (isAuthenticated && isLoading) {
      logger.debug('ProtectedRoute: hydrated, waiting for token validation...')
    } else if (tokenValid === true) {
      logger.debug('ProtectedRoute: token valid, rendering protected content')
    } else if (tokenValid === false) {
      logger.debug('ProtectedRoute: token invalid, redirecting to login')
    } else if (isAuthenticated && !isLoading && tokenValid === undefined) {
      logger.debug(
        'ProtectedRoute: authenticated but token validation not started or failed silently'
      )
    }
  }, [hasHydrated, isAuthenticated, isLoading, tokenValid])

  // Wait for Zustand to rehydrate auth state from localStorage before making
  // any redirect decisions. Without this gate the initial `accessToken: null`
  // would cause an immediate redirect to /login on every protected route.
  // We also wait for token validation if we are authenticated.
  if (!hasHydrated || (isAuthenticated && isLoading)) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-muted-foreground'>Validating session...</p>
        </div>
      </div>
    )
  }

  // Show error UI if token validation failed with an error
  if (error) {
    logger.error('ProtectedRoute: token validation error', { error })
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='text-center max-w-md p-6'>
          <div className='mb-4'>
            <svg
              className='mx-auto h-12 w-12 text-destructive'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
              />
            </svg>
          </div>
          <h2 className='text-lg font-semibold mb-2'>
            Session Validation Failed
          </h2>
          <p className='text-muted-foreground mb-6'>
            Unable to validate your session. Please try again or log in.
          </p>
          <div className='flex gap-3 justify-center'>
            <button
              type='button'
              onClick={() => refetch()}
              className='px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors'
            >
              Retry Validation
            </button>
            <button
              type='button'
              onClick={() => {
                clearAuth()
                localStorage.removeItem('user')
                window.location.href = '/login'
              }}
              className='px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors'
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // If not authenticated or token is invalid, redirect to login
  if (!isAuthenticated || tokenValid === false) {
    return <Navigate to='/login' state={{ from: location }} replace />
  }

  return <>{children}</>
}
