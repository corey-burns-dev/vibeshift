// Chat hooks with TanStack Query

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { apiClient } from '@/api/client'
import type {
  CreateConversationRequest,
  Message,
  PaginationParams,
  SendMessageRequest,
} from '@/api/types'
import { handleAuthOrFKError } from '../lib/handleAuthOrFKError'

// Query keys
const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  conversation: (id: number) => [...chatKeys.all, 'conversation', id] as const,
  messages: (conversationId: number) => [...chatKeys.all, 'messages', conversationId] as const,
}

// ===== Conversations =====

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => apiClient.getConversations(),
  })
}

export function useConversation(id: number) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => apiClient.getConversation(id),
    enabled: id > 0,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: CreateConversationRequest) => apiClient.createConversation(data),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
      navigate(`/chat/${conversation.id}`)
    },
    onError: (error) => {
      handleAuthOrFKError(error)
    },
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: number) => apiClient.markConversationAsRead(conversationId),
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.conversation(conversationId),
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
    onError: (error) => {
      handleAuthOrFKError(error)
    },
  })
}

// ===== Messages =====

export function useMessages(conversationId: number, params?: PaginationParams) {
  return useQuery({
    queryKey: [...chatKeys.messages(conversationId), params],
    queryFn: () => apiClient.getMessages(conversationId, params),
    enabled: conversationId > 0,
  })
}

export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SendMessageRequest) => apiClient.sendMessage(conversationId, data),
    onMutate: async (newMessage) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: chatKeys.messages(conversationId),
      })

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(
        chatKeys.messages(conversationId)
      )

      // Optimistically update
      if (previousMessages) {
        const optimisticMessage: Message = {
          id: Date.now(), // temporary ID
          conversation_id: conversationId,
          sender_id: 0, // will be set by server
          content: newMessage.content,
          message_type: newMessage.message_type || 'text',
          metadata: newMessage.metadata,
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        queryClient.setQueryData<Message[]>(chatKeys.messages(conversationId), [
          ...previousMessages,
          optimisticMessage,
        ])
      }

      return { previousMessages }
    },
    onError: (error, _newMessage, context) => {
      handleAuthOrFKError(error)
      if (context?.previousMessages) {
        queryClient.setQueryData(chatKeys.messages(conversationId), context.previousMessages)
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(conversationId),
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useDeleteMessage(conversationId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (messageId: number) => apiClient.deleteMessage(conversationId, messageId),
    onMutate: async (messageId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: chatKeys.messages(conversationId),
      })

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(
        chatKeys.messages(conversationId)
      )

      // Optimistically remove message
      if (previousMessages) {
        queryClient.setQueryData<Message[]>(
          chatKeys.messages(conversationId),
          previousMessages.filter((msg) => msg.id !== messageId)
        )
      }

      return { previousMessages }
    },
    onError: (error, _messageId, context) => {
      handleAuthOrFKError(error)
      if (context?.previousMessages) {
        queryClient.setQueryData(chatKeys.messages(conversationId), context.previousMessages)
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(conversationId),
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}
