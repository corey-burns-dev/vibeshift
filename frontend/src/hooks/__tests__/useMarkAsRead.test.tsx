import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useMarkAsRead } from '@/hooks/useChat'

vi.mock('@/api/client', () => ({
  apiClient: {
    markConversationAsRead: vi.fn(),
  },
}))

describe('useMarkAsRead', () => {
  it('sets unread_count to 0 on success', async () => {
    const qc = new QueryClient()
    const wrapper = ({ children }: React.PropsWithChildren<unknown>) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    // Seed caches
    qc.setQueryData(['chat', 'conversation', 11], { id: 11, unread_count: 3 })
    qc.setQueryData(
      ['chat', 'conversations'],
      [
        { id: 11, unread_count: 3 },
        { id: 12, unread_count: 0 },
      ]
    )

    // Make API succeed
    vi.mocked(apiClient.markConversationAsRead).mockResolvedValue({
      message: 'success',
    })

    const { result } = renderHook(() => useMarkAsRead(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(11)
    })

    const single = qc.getQueryData(['chat', 'conversation', 11]) as
      | { id: number; unread_count: number }
      | undefined
    const list =
      (qc.getQueryData(['chat', 'conversations']) as
        | Array<{ id: number; unread_count: number }>
        | undefined) ?? []

    expect(single!.unread_count).toBe(0)
    expect(list.find(c => c.id === 11)!.unread_count).toBe(0)
  })
})
