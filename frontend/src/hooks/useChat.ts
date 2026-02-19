// Chat hooks with TanStack Query

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type {
  CreateConversationRequest,
  Message,
  MessageReactionResponse,
  MuteChatroomUserRequest,
  PaginationParams,
  SendMessageRequest,
} from '@/api/types'
import { handleAuthOrFKError } from '../lib/handleAuthOrFKError'
import { getCurrentUser } from './useUsers'

// Query keys
const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  conversation: (id: number) => [...chatKeys.all, 'conversation', id] as const,
  messages: (conversationId: number) =>
    [...chatKeys.all, 'messages', conversationId] as const,
  chatrooms: () => [...chatKeys.all, 'chatrooms'] as const,
  chatroomsAll: () => [...chatKeys.chatrooms(), 'all'] as const,
  chatroomsJoined: () => [...chatKeys.chatrooms(), 'joined'] as const,
  chatroomModerators: (chatroomId: number) =>
    [...chatKeys.chatrooms(), 'moderators', chatroomId] as const,
  chatroomMutes: (chatroomId: number) =>
    [...chatKeys.chatrooms(), 'mutes', chatroomId] as const,
  chatroomBans: (chatroomId: number) =>
    [...chatKeys.chatrooms(), 'bans', chatroomId] as const,
}

function applyReactionSummaryToMessages(
  messages: Message[] | undefined,
  messageId: number,
  reactionSummary: MessageReactionResponse['reactions']
) {
  if (!Array.isArray(messages)) return messages
  return messages.map(message =>
    message.id === messageId
      ? { ...message, reaction_summary: reactionSummary }
      : message
  )
}

// ===== Conversations =====

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => apiClient.getConversations(),
  })
}

// ===== Chatrooms =====

export function useAllChatrooms() {
  return useQuery({
    queryKey: chatKeys.chatroomsAll(),
    queryFn: () => apiClient.getAllChatrooms(),
  })
}

export function useJoinedChatrooms() {
  return useQuery({
    queryKey: chatKeys.chatroomsJoined(),
    queryFn: () => apiClient.getJoinedChatrooms(),
  })
}

export function useJoinChatroom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (chatroomId: number) => apiClient.joinChatroom(chatroomId),
    onSuccess: (_, chatroomId) => {
      // Invalidate both chatroom queries to refresh the lists
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
      queryClient.invalidateQueries({
        queryKey: chatKeys.conversation(chatroomId),
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useChatroomModerators(chatroomId: number) {
  return useQuery({
    queryKey: chatKeys.chatroomModerators(chatroomId),
    queryFn: () => apiClient.getChatroomModerators(chatroomId),
    enabled: chatroomId > 0,
  })
}

export function useAddChatroomModerator(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.addChatroomModerator(chatroomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.chatroomModerators(chatroomId),
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRemoveChatroomModerator(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.removeChatroomModerator(chatroomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.chatroomModerators(chatroomId),
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRoomMutes(chatroomId: number) {
  return useQuery({
    queryKey: chatKeys.chatroomMutes(chatroomId),
    queryFn: () => apiClient.getChatroomMutes(chatroomId),
    enabled: chatroomId > 0,
  })
}

export function useRoomMuteUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: number
      payload: MuteChatroomUserRequest
    }) => apiClient.muteChatroomUser(chatroomId, userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chatroomMutes(chatroomId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRoomUnmuteUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => apiClient.unmuteChatroomUser(chatroomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chatroomMutes(chatroomId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRoomBans(chatroomId: number) {
  return useQuery({
    queryKey: chatKeys.chatroomBans(chatroomId),
    queryFn: () => apiClient.getChatroomBans(chatroomId),
    enabled: chatroomId > 0,
  })
}

export function useRoomBanUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason?: string }) =>
      apiClient.banChatroomUser(chatroomId, userId, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chatroomBans(chatroomId) })
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(chatroomId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRoomUnbanUser(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => apiClient.unbanChatroomUser(chatroomId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chatroomBans(chatroomId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useKickChatroomParticipant(chatroomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (participantId: number) =>
      apiClient.removeChatroomParticipant(chatroomId, participantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(chatroomId) })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useConversation(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => apiClient.getConversation(id),
    enabled: (options?.enabled ?? true) && id > 0,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateConversationRequest) =>
      apiClient.createConversation(data),
    onSuccess: _conversation => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: number) =>
      apiClient.markConversationAsRead(conversationId),
    onSuccess: (_, conversationId) => {
      // Optimistically update cache instead of invalidating to avoid refetch storms
      // that could re-trigger effects and cause request loops.
      queryClient.setQueryData(
        chatKeys.conversation(conversationId),
        (old: { unread_count?: number } | undefined) =>
          old ? { ...old, unread_count: 0 } : old
      )
      queryClient.setQueryData(
        chatKeys.conversations(),
        (old: Array<{ id: number; unread_count?: number }> | undefined) =>
          Array.isArray(old)
            ? old.map(c =>
                c.id === conversationId ? { ...c, unread_count: 0 } : c
              )
            : old
      )
    },
    onError: error => {
      // 403 from mark-as-read means "not a participant" -- not an auth failure.
      // Silently ignore to avoid false session invalidation.
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) return
      handleAuthOrFKError(error)
    },
  })
}

export function useLeaveConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: number) =>
      apiClient.leaveConversation(conversationId),
    onSuccess: (_resp, conversationId) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
      queryClient.invalidateQueries({ queryKey: chatKeys.chatrooms() })
      queryClient.removeQueries({ queryKey: chatKeys.messages(conversationId) })
      queryClient.removeQueries({
        queryKey: chatKeys.conversation(conversationId),
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// ===== Messages =====

export function useMessages(
  conversationId: number,
  params?: PaginationParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: params
      ? [...chatKeys.messages(conversationId), params]
      : chatKeys.messages(conversationId),
    queryFn: () => apiClient.getMessages(conversationId, params),
    enabled: (options?.enabled ?? true) && conversationId > 0,
  })
}

export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient()
  const currentUser = getCurrentUser()

  return useMutation({
    mutationFn: (data: SendMessageRequest) =>
      apiClient.sendMessage(conversationId, data),
    onMutate: async newMessage => {
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
          sender_id: currentUser?.id || 0,
          sender: currentUser || undefined,
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
    onSuccess: (serverMessage, newMessage) => {
      const tempId = newMessage.metadata?.tempId
      if (!tempId) return

      queryClient.setQueryData<Message[]>(
        chatKeys.messages(conversationId),
        old => {
          if (!Array.isArray(old)) return old

          // Check if the server message (real ID) is already in the list (e.g. from WebSocket)
          const alreadyExists = old.some(m => m.id === serverMessage.id)

          if (alreadyExists) {
            // If it exists, remove the optimistic message BUT keep the real one
            return old.filter(m => {
              // Keep the confirmed message
              if (m.id === serverMessage.id) return true

              // Remove the temporary optimistic one
              const mMeta = m.metadata as Record<string, unknown> | undefined
              return mMeta?.tempId !== tempId
            })
          }

          // Otherwise, replace the optimistic message with the server version
          return old.map(m => {
            const mMeta = m.metadata as Record<string, unknown> | undefined
            if (mMeta?.tempId === tempId) return serverMessage
            return m
          })
        }
      )
    },
    onError: (error, _newMessage, context) => {
      handleAuthOrFKError(error)
      if (context?.previousMessages) {
        queryClient.setQueryData(
          chatKeys.messages(conversationId),
          context.previousMessages
        )
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useDeleteMessage(conversationId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (messageId: number) =>
      apiClient.deleteMessage(conversationId, messageId),
    onMutate: async messageId => {
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
          previousMessages.filter(msg => msg.id !== messageId)
        )
      }

      return { previousMessages }
    },
    onError: (error, _messageId, context) => {
      handleAuthOrFKError(error)
      if (context?.previousMessages) {
        queryClient.setQueryData(
          chatKeys.messages(conversationId),
          context.previousMessages
        )
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

export function useAddMessageReaction(conversationId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string }) =>
      apiClient.addMessageReaction(conversationId, messageId, emoji),
    onSuccess: response => {
      queryClient.setQueryData<Message[]>(
        chatKeys.messages(conversationId),
        oldMessages =>
          applyReactionSummaryToMessages(
            oldMessages,
            response.message_id,
            response.reactions
          )
      )
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

export function useRemoveMessageReaction(conversationId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string }) =>
      apiClient.removeMessageReaction(conversationId, messageId, emoji),
    onSuccess: response => {
      queryClient.setQueryData<Message[]>(
        chatKeys.messages(conversationId),
        oldMessages =>
          applyReactionSummaryToMessages(
            oldMessages,
            response.message_id,
            response.reactions
          )
      )
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}
