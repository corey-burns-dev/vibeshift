import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import {
  useAllChatrooms,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteMessage,
  useJoinChatroom,
  useJoinedChatrooms,
  useLeaveConversation,
  useMarkAsRead,
  useMessages,
  useSendMessage,
} from '@/hooks/useChat'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/api/client', () => ({
  apiClient: {
    getConversations: vi.fn(),
    getConversation: vi.fn(),
    getMessages: vi.fn(),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
    deleteMessage: vi.fn(),
    markConversationAsRead: vi.fn(),
    leaveConversation: vi.fn(),
    getAllChatrooms: vi.fn(),
    getJoinedChatrooms: vi.fn(),
    joinChatroom: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useChat hooks', () => {
  beforeAll(() => {
    const store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k]
        },
      },
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    const user = { id: 1, username: 'test', email: 'test@example.com' }
    localStorage.setItem('user', JSON.stringify(user))
  })

  describe('useConversations', () => {
    it('fetches and returns conversations', async () => {
      const convos = [
        {
          id: 1,
          is_group: false,
          created_by: 1,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getConversations.mockResolvedValue(convos as never)

      const { result } = renderHook(() => useConversations(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(convos)
    })
  })

  describe('useConversation', () => {
    it('fetches conversation when id > 0', async () => {
      const convo = {
        id: 1,
        is_group: false,
        created_by: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient).getConversation.mockResolvedValue(convo as never)

      const { result } = renderHook(() => useConversation(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(convo)
    })

    it('does not fetch when id is 0', () => {
      const { result } = renderHook(() => useConversation(0), {
        wrapper: createWrapper(),
      })
      expect(result.current.isFetching).toBe(false)
      expect(vi.mocked(apiClient).getConversation).not.toHaveBeenCalled()
    })
  })

  describe('useMessages', () => {
    it('fetches messages for conversation', async () => {
      const messages = [
        {
          id: 1,
          conversation_id: 1,
          sender_id: 1,
          content: 'Hi',
          message_type: 'text' as const,
          is_read: false,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient).getMessages.mockResolvedValue(messages as never)

      const { result } = renderHook(() => useMessages(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(messages)
    })
  })

  describe('useAllChatrooms', () => {
    it('fetches all chatrooms', async () => {
      const rooms = [
        {
          id: 1,
          is_group: true,
          created_by: 1,
          created_at: '',
          updated_at: '',
          is_joined: false,
        },
      ]
      vi.mocked(apiClient.getAllChatrooms).mockResolvedValue(rooms as never)

      const { result } = renderHook(() => useAllChatrooms(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(rooms)
    })
  })

  describe('useJoinedChatrooms', () => {
    it('fetches joined chatrooms', async () => {
      const rooms = [
        {
          id: 1,
          is_group: true,
          created_by: 1,
          created_at: '',
          updated_at: '',
        },
      ]
      vi.mocked(apiClient.getJoinedChatrooms).mockResolvedValue(rooms as never)

      const { result } = renderHook(() => useJoinedChatrooms(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(rooms)
    })
  })

  describe('useCreateConversation', () => {
    it('calls API and invalidates conversations', async () => {
      const newConvo = {
        id: 2,
        is_group: false,
        created_by: 1,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient.createConversation).mockResolvedValue(
        newConvo as never
      )

      const { result } = renderHook(() => useCreateConversation(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ participant_ids: [2] })
      })

      expect(vi.mocked(apiClient).createConversation).toHaveBeenCalledWith({
        participant_ids: [2],
      })
    })
  })

  describe('useJoinChatroom', () => {
    it('calls API with chatroom id', async () => {
      vi.mocked(apiClient.joinChatroom).mockResolvedValue({
        message: 'ok',
      } as never)

      const { result } = renderHook(() => useJoinChatroom(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(5)
      })

      expect(vi.mocked(apiClient).joinChatroom).toHaveBeenCalledWith(5)
    })
  })

  describe('useMarkAsRead', () => {
    it('calls API with conversation id', async () => {
      vi.mocked(apiClient.markConversationAsRead).mockResolvedValue({
        message: 'ok',
      } as never)

      const { result } = renderHook(() => useMarkAsRead(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(3)
      })

      expect(vi.mocked(apiClient).markConversationAsRead).toHaveBeenCalledWith(
        3
      )
    })
  })

  describe('useLeaveConversation', () => {
    it('calls API with conversation id', async () => {
      vi.mocked(apiClient.leaveConversation).mockResolvedValue({
        message: 'ok',
      } as never)

      const { result } = renderHook(() => useLeaveConversation(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(3)
      })

      expect(vi.mocked(apiClient).leaveConversation).toHaveBeenCalledWith(3)
    })
  })

  describe('useSendMessage', () => {
    it('calls API with conversation id and content', async () => {
      const serverMsg = {
        id: 10,
        conversation_id: 1,
        sender_id: 1,
        content: 'Hello',
        message_type: 'text' as const,
        is_read: false,
        created_at: '',
        updated_at: '',
      }
      vi.mocked(apiClient.sendMessage).mockResolvedValue(serverMsg as never)

      const { result } = renderHook(() => useSendMessage(1), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync({ content: 'Hello' })
      })

      expect(vi.mocked(apiClient).sendMessage).toHaveBeenCalledWith(1, {
        content: 'Hello',
      })
    })
  })

  describe('useDeleteMessage', () => {
    it('calls API with conversation id and message id', async () => {
      vi.mocked(apiClient.deleteMessage).mockResolvedValue(undefined as never)

      const { result } = renderHook(() => useDeleteMessage(1), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        await result.current.mutateAsync(99)
      })

      expect(vi.mocked(apiClient).deleteMessage).toHaveBeenCalledWith(1, 99)
    })
  })
})
