// Post Hooks - using TanStack Query with optimistic updates

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type {
  CreatePostRequest,
  PaginationParams,
  Post,
  SearchParams,
  UpdatePostRequest,
} from '../api/types'
import { handleAuthOrFKError } from '../lib/handleAuthOrFKError'

// Query keys
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (params?: PaginationParams) => [...postKeys.lists(), params] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: number) => [...postKeys.details(), id] as const,
  search: (params: SearchParams) =>
    [...postKeys.all, 'search', params] as const,
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
    queryFn: ({ pageParam = 0 }) =>
      apiClient.getPosts({ offset: pageParam, limit }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < limit) return undefined
      return allPages.length * limit
    },
    initialPageParam: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
      queryClient.invalidateQueries({ queryKey: postKeys.lists() })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Update post
export function useUpdatePost(postId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePostRequest) => apiClient.updatePost(postId, data),
    onMutate: async newData => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: postKeys.detail(postId) })

      // Snapshot the previous value
      const previousPost = queryClient.getQueryData<Post>(
        postKeys.detail(postId)
      )

      // Optimistically update
      if (previousPost) {
        queryClient.setQueryData<Post>(postKeys.detail(postId), {
          ...previousPost,
          ...newData,
        })
      }

      return { previousPost }
    },
    onError: (error, _variables, context) => {
      handleAuthOrFKError(error)
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
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Helper function to perform optimistic updates on both detail and list caches
function updatePostInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: number,
  updateFn: (oldPost: Post) => Post
) {
  // Find all infinite posts queries
  const infiniteQueries = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['posts', 'infinite'] })

  // Update each infinite query cache
  for (const query of infiniteQueries) {
    queryClient.setQueryData<
      { pages: Post[][]; pageParams: unknown[] } | undefined
    >(query.queryKey, oldData => {
      if (!oldData) return oldData
      return {
        ...oldData,
        pages: oldData.pages.map((page: Post[]) =>
          page.map(post => (post.id === postId ? updateFn(post) : post))
        ),
      }
    })
  }

  // Also update the detail cache
  queryClient.setQueryData<Post>(postKeys.detail(postId), oldPost =>
    oldPost ? updateFn(oldPost) : undefined
  )
}

// Like/Toggle post (backend handles toggle logic)
export function useLikePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: number) => apiClient.likePost(postId),
    onSuccess: updatedPost => {
      // Update cache with server response
      updatePostInCache(queryClient, updatedPost.id, () => updatedPost)

      // Also update the detail cache if it exists
      queryClient.setQueryData<Post>(
        postKeys.detail(updatedPost.id),
        () => updatedPost
      )
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Vote on poll
export function useVotePoll() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      postId,
      pollOptionId,
    }: {
      postId: number
      pollOptionId: number
    }) => apiClient.votePoll(postId, pollOptionId),
    onSuccess: updatedPost => {
      updatePostInCache(queryClient, updatedPost.id, () => updatedPost)
      queryClient.invalidateQueries({ queryKey: ['posts', 'infinite'] })
      queryClient.invalidateQueries({
        queryKey: postKeys.detail(updatedPost.id),
      })
    },
    onError: error => {
      handleAuthOrFKError(error)
    },
  })
}

// Unlike post
export function useUnlikePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: number) => apiClient.unlikePost(postId),
    onMutate: async (postId: number) => {
      await queryClient.cancelQueries({ queryKey: postKeys.all })

      const previousPost = queryClient.getQueryData<Post>(
        postKeys.detail(postId)
      )
      const infiniteQueries = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['posts', 'infinite'] })
      const previousInfinitePostsData = infiniteQueries.map(q => ({
        queryKey: q.queryKey,
        data: queryClient.getQueryData(q.queryKey),
      }))

      // Optimistically update
      updatePostInCache(queryClient, postId, oldPost => ({
        ...oldPost,
        likes_count: Math.max((oldPost.likes_count ?? 0) - 1, 0),
        liked: false,
      }))

      return { previousPost, previousInfinitePostsData }
    },
    onSuccess: updatedPost => {
      // Use the returned post to update cache
      updatePostInCache(queryClient, updatedPost.id, () => updatedPost)
    },
    onError: (error, postId, context) => {
      handleAuthOrFKError(error)
      if (context?.previousPost) {
        queryClient.setQueryData(postKeys.detail(postId), context.previousPost)
      }
      context?.previousInfinitePostsData?.forEach(query => {
        if (query.data) {
          queryClient.setQueryData(query.queryKey, query.data)
        }
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.all })
    },
  })
}
