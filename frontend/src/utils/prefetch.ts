import type { QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { sanctumKeys } from '@/hooks/useSanctums'
import { userKeys } from '@/hooks/useUsers'

// Prefetch utilities for route transitions
export const prefetchUtils = {
  // Prefetch current user profile
  async prefetchUserProfile(queryClient: QueryClient) {
    await queryClient.prefetchQuery({
      queryKey: userKeys.me(),
      queryFn: () => apiClient.getMyProfile(),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  },

  // Prefetch posts feed
  async prefetchPosts(queryClient: QueryClient) {
    await queryClient.prefetchQuery({
      queryKey: ['posts', { offset: 0, limit: 10 }],
      queryFn: () => apiClient.getPosts({ offset: 0, limit: 10 }),
      staleTime: 2 * 60 * 1000, // 2 minutes
    })
  },

  // Prefetch personalized feed shell
  async prefetchFeed(queryClient: QueryClient) {
    const memberships = await queryClient.fetchQuery({
      queryKey: sanctumKeys.myMemberships(),
      queryFn: () => apiClient.getMySanctumMemberships(),
      staleTime: 2 * 60 * 1000,
    })

    await Promise.all(
      memberships.slice(0, 3).map(membership =>
        queryClient.prefetchQuery({
          queryKey: ['posts', 'membership-feed', membership.sanctum_id, 10],
          queryFn: () =>
            apiClient.getPosts({
              offset: 0,
              limit: 10,
              sanctum_id: membership.sanctum_id,
            }),
          staleTime: 60 * 1000,
        })
      )
    )
  },

  // Prefetch friends list
  async prefetchFriends(queryClient: QueryClient) {
    await queryClient.prefetchQuery({
      queryKey: ['friends'],
      queryFn: () => apiClient.getFriends(),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  },

  // Prefetch conversations for chat
  async prefetchConversations(queryClient: QueryClient) {
    await queryClient.prefetchQuery({
      queryKey: ['conversations'],
      queryFn: () => apiClient.getConversations(),
      staleTime: 1 * 60 * 1000, // 1 minute
    })
  },
}

// Route prefetch mapping
export const routePrefetchMap: Record<
  string,
  (queryClient: QueryClient) => Promise<void>
> = {
  '/': prefetchUtils.prefetchPosts,
  '/posts': prefetchUtils.prefetchPosts,
  '/feed': prefetchUtils.prefetchFeed,
  '/profile': prefetchUtils.prefetchUserProfile,
  '/friends': prefetchUtils.prefetchFriends,
  '/chat': prefetchUtils.prefetchConversations,
}
