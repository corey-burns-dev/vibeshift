import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function Thrower(): null {
  throw new Error('Test error')
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders error fallback when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/unexpected error/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument()

    vi.restoreAllMocks()
  })

  it('renders custom fallback when provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const CustomFallback = ({
      error,
      resetError,
    }: {
      error?: Error
      resetError: () => void
    }) => (
      <div>
        <p>Custom: {error?.message}</p>
        <button type='button' onClick={resetError}>
          Retry
        </button>
      </div>
    )

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <Thrower />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom: Test error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    vi.restoreAllMocks()
  })

  it('Try again button is present and clickable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    )

    const tryAgain = screen.getByRole('button', { name: 'Try again' })
    expect(tryAgain).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(tryAgain)

    vi.restoreAllMocks()
  })
})
