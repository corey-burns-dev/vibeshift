// Post Hooks - using TanStack Query with optimistic updates

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type {
  CreatePostRequest,
  PaginationParams,
  Post,
  SearchParams,
  UpdatePostRequest,
} from '../api/types'

// Query keys
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (params?: PaginationParams) => [...postKeys.lists(), params] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: number) => [...postKeys.details(), id] as const,
  search: (params: SearchParams) => [...postKeys.all, 'search', params] as const,
}

// Get all posts (paginated)
export function usePosts(params?: PaginationParams) {
  return useQuery({
    queryKey: postKeys.list(params),
    queryFn: () => apiClient.getPosts(params),
  })
}

// Get all posts with infinite scroll
export function useInfinitePosts(limit = 10) {
  return useInfiniteQuery({
    queryKey: ['posts', 'infinite', limit],
    queryFn: ({ pageParam = 0 }) => apiClient.getPosts({ offset: pageParam, limit }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < limit) return undefined
      return allPages.length * limit
    },
    initialPageParam: 0,
  })
}

// Get single post
export function usePost(id: number) {
  return useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => apiClient.getPost(id),
    enabled: !!id,
  })
}

// Search posts
export function useSearchPosts(params: SearchParams) {
  return useQuery({
    queryKey: postKeys.search(params),
    queryFn: () => apiClient.searchPosts(params),
    enabled: !!params.q,
  })
}

// Create post
export function useCreatePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreatePostRequest) => apiClient.createPost(data),
    onSuccess: () => {
      // Invalidate and refetch posts
      queryClient.invalidateQueries({ queryKey: postKeys.lists() })
    },
  })
}

// Update post
export function useUpdatePost(postId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePostRequest) => apiClient.updatePost(postId, data),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: postKeys.detail(postId) })

      // Snapshot the previous value
      const previousPost = queryClient.getQueryData<Post>(postKeys.detail(postId))

      // Optimistically update
      if (previousPost) {
        queryClient.setQueryData<Post>(postKeys.detail(postId), {
          ...previousPost,
          ...newData,
        })
      }

      return { previousPost }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousPost) {
        queryClient.setQueryData(postKeys.detail(postId), context.previousPost)
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) })
    },
  })
}

// Delete post
export function useDeletePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: number) => apiClient.deletePost(postId),
    onSuccess: (_data, postId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: postKeys.detail(postId) })
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: postKeys.lists() })
    },
  })
}

// Like post
export function useLikePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: number) => apiClient.likePost(postId),
    onMutate: async (postId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: postKeys.detail(postId) })

      // Snapshot the previous value
      const previousPost = queryClient.getQueryData<Post>(postKeys.detail(postId))

      // Optimistically update likes
      if (previousPost) {
        queryClient.setQueryData<Post>(postKeys.detail(postId), {
          ...previousPost,
          likes: previousPost.likes + 1,
        })
      }

      return { previousPost }
    },
    onError: (_err, postId, context) => {
      // Rollback on error
      if (context?.previousPost) {
        queryClient.setQueryData(postKeys.detail(postId), context.previousPost)
      }
    },
    onSettled: (_data, _error, postId) => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) })
    },
  })
}
