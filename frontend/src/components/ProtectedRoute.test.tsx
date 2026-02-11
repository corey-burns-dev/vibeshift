import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from '@/components/ProtectedRoute'

import {
  useIsAuthenticated as useIsAuthenticatedHook,
  useValidateToken as useValidateTokenHook,
} from '@/hooks/useUsers'

vi.mock('@/hooks/useUsers', () => ({
  useIsAuthenticated: vi.fn(),
  useValidateToken: vi.fn(),
}))

function renderProtected(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path='/'
          element={
            <ProtectedRoute>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path='/login' element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated and token valid', () => {
    vi.mocked(useIsAuthenticatedHook).mockReturnValue(true)
    vi.mocked(useValidateTokenHook).mockReturnValue({
      data: true,
      isLoading: false,
    } as never)

    renderProtected('/')
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects to login when not authenticated', () => {
    vi.mocked(useIsAuthenticatedHook).mockReturnValue(false)
    vi.mocked(useValidateTokenHook).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)

    renderProtected('/')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('shows validating session when loading and authenticated', () => {
    vi.mocked(useIsAuthenticatedHook).mockReturnValue(true)
    vi.mocked(useValidateTokenHook).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never)

    renderProtected('/')
    expect(screen.getByText('Validating session...')).toBeInTheDocument()
  })
})
