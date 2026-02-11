import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile, useMediaQuery } from '@/hooks/useMediaQuery'

describe('useMediaQuery', () => {
  const mockMatchMedia = vi.fn()

  beforeEach(() => {
    mockMatchMedia.mockReset()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial matches from media query', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(true)
    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 768px)')
  })

  it('returns false when media does not match', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(false)
  })

  it('updates when change event fires', () => {
    const addListener = vi.fn()
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: addListener,
      removeEventListener: vi.fn(),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    const handler = addListener.mock.calls[0]?.[1]
    expect(handler).toBeDefined()

    act(() => {
      handler?.({ matches: true })
    })

    expect(result.current).toBe(true)
  })
})

describe('useIsMobile', () => {
  const mockMatchMedia = vi.fn()

  beforeEach(() => {
    mockMatchMedia.mockReset()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    })
  })

  it('uses max-width 767px query', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    renderHook(() => useIsMobile())

    expect(mockMatchMedia).toHaveBeenCalledWith('(max-width: 767px)')
  })
})
