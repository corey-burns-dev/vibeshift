import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useStream, useStreams } from '@/hooks/useStreams'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getStreams: vi.fn(),
    getStream: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useStreams hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useStreams', () => {
    it('fetches streams list', async () => {
      const streams = [
        {
          id: 1,
          user_id: 1,
          title: 'Stream',
          stream_url: 'https://example.com',
          stream_type: 'hls' as const,
          is_live: true,
          viewer_count: 0,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getStreams.mockResolvedValue(streams as never)

      const { result } = renderHook(() => useStreams(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(streams)
    })
  })

  describe('useStream', () => {
    it('fetches single stream when id > 0', async () => {
      const stream = {
        id: 1,
        user_id: 1,
        title: 'Stream',
        stream_url: 'https://example.com',
        stream_type: 'hls' as const,
        is_live: true,
        viewer_count: 0,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).getStream.mockResolvedValue(stream as never)

      const { result } = renderHook(() => useStream(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(stream)
    })
  })
})
