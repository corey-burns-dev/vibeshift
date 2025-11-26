// Comment Hooks - using TanStack Query

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { Comment, CreateCommentRequest, UpdateCommentRequest } from '../api/types'
import { handleAuthOrFKError } from '../lib/handleAuthOrFKError'

// Query keys
export const commentKeys = {
  all: ['comments'] as const,
  lists: () => [...commentKeys.all, 'list'] as const,
  list: (postId: number) => [...commentKeys.lists(), postId] as const,
}

// Get post comments
export function usePostComments(postId: number) {
  return useQuery({
    queryKey: commentKeys.list(postId),
    queryFn: () => apiClient.getPostComments(postId),
    enabled: !!postId,
  })
}

// Create comment
export function useCreateComment(postId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCommentRequest) => apiClient.createComment(postId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) })
    },
    onError: (error) => {
      handleAuthOrFKError(error)
    },
  })
}

// Update comment
export function useUpdateComment(postId: number, commentId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateCommentRequest) => apiClient.updateComment(postId, commentId, data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: commentKeys.list(postId) })

      // Snapshot previous value
      const previousComments = queryClient.getQueryData<Comment[]>(commentKeys.list(postId))

      // Optimistically update
      if (previousComments) {
        queryClient.setQueryData<Comment[]>(
          commentKeys.list(postId),
          previousComments.map((comment) =>
            comment.id === commentId ? { ...comment, ...newData } : comment
          )
        )
      }

      return { previousComments }
    },
    onError: (error, _newData, context) => {
      handleAuthOrFKError(error)
      if (context?.previousComments) {
        queryClient.setQueryData(commentKeys.list(postId), context.previousComments)
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) })
    },
  })
}

// Delete comment
export function useDeleteComment(postId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: number) => apiClient.deleteComment(postId, commentId),
    onMutate: async (commentId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: commentKeys.list(postId) })

      // Snapshot previous value
      const previousComments = queryClient.getQueryData<Comment[]>(commentKeys.list(postId))

      // Optimistically update
      if (previousComments) {
        queryClient.setQueryData<Comment[]>(
          commentKeys.list(postId),
          previousComments.filter((comment) => comment.id !== commentId)
        )
      }

      return { previousComments }
    },
    onError: (error, _commentId, context) => {
      handleAuthOrFKError(error)
      if (context?.previousComments) {
        queryClient.setQueryData(commentKeys.list(postId), context.previousComments)
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) })
    },
  })
}
