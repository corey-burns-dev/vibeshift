import React from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  requestId?: string
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let requestId: string | undefined
    if (error instanceof ApiError) {
      requestId = error.requestId
    }
    return { hasError: true, error, requestId }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Error caught by boundary:', { error, errorInfo })
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return (
          <FallbackComponent
            error={this.state.error}
            resetError={this.resetError}
          />
        )
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          resetError={this.resetError}
          requestId={this.state.requestId}
        />
      )
    }

    return this.props.children
  }
}

function DefaultErrorFallback({
  error,
  resetError,
  requestId,
}: {
  error?: Error
  resetError: () => void
  requestId?: string
}) {
  return (
    <div className='min-h-screen bg-background flex items-center justify-center p-4'>
      <div className='max-w-md w-full text-center'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-destructive mb-2'>
            Something went wrong
          </h1>
          <p className='text-muted-foreground'>
            We encountered an unexpected error. Please try again.
          </p>
        </div>

        {(error || requestId) && (
          <details className='mb-6 text-left'>
            <summary className='cursor-pointer text-sm text-muted-foreground hover:text-foreground'>
              Error details
            </summary>
            <div className='mt-2 p-3 bg-muted rounded text-xs overflow-auto'>
              {requestId && (
                <div className='mb-2 font-mono text-primary'>
                  Request ID: {requestId}
                </div>
              )}
              {error && (
                <pre className='whitespace-pre-wrap'>{error.message}</pre>
              )}
            </div>
          </details>
        )}

        <div className='flex gap-3 justify-center'>
          <Button onClick={resetError} variant='outline'>
            Try again
          </Button>
          <Button
            onClick={() => {
              window.location.href = '/'
            }}
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ErrorBoundary }
