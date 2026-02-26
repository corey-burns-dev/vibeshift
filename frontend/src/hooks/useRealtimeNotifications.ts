import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import {
  DEFAULT_RECONNECT_DELAYS,
  useManagedWebSocket,
} from '@/hooks/useManagedWebSocket'
import { usePresenceStore } from '@/hooks/usePresence'
import { useTokenRefreshReconnect } from '@/hooks/useTokenRefreshReconnect'
import { dispatchGameRoomRealtimeUpdate } from '@/lib/game-realtime-events'
import { logger } from '@/lib/logger'
import { createTicketedWS } from '@/lib/ws-utils'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'

type RealtimeEventType =
  | 'post_created'
  | 'post_reaction_updated'
  | 'comment_created'
  // ... (rest of the types)
  | 'comment_updated'
  | 'comment_deleted'
  | 'message_received'
  | 'friend_request_received'
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_request_rejected'
  | 'friend_request_cancelled'
  | 'friend_added'
  | 'friend_removed'
  | 'friend_presence_changed'
  | 'friends_online_snapshot'
  | 'sanctum_request_created'
  | 'sanctum_request_reviewed'
  | 'chat_mention'
  | 'game_room_updated'

interface RealtimeEvent {
  type?: RealtimeEventType
  payload?: Record<string, unknown>
}

interface InfinitePostsData {
  pages: Array<
    Array<{
      id: number
      likes_count?: number
      comments_count?: number
    }>
  >
  pageParams: unknown[]
}

interface RealtimeComment {
  id: number
  post_id: number
  content: string
  user_id: number
  created_at: string
  updated_at: string
  user?: {
    id?: number
    username?: string
    avatar?: string
  }
}

export interface AppNotification {
  id: string
  title: string
  description: string
  createdAt: string
  read: boolean
  meta?: {
    type?: string
    requestId?: number
    userId?: number
    conversationId?: number
  }
}

interface NotificationStore {
  items: AppNotification[]
  add: (item: Omit<AppNotification, 'id' | 'read'>) => void
  remove: (id: string) => void
  markRead: (id: string) => void
  markAllRead: () => void
  unreadCount: () => number
  clear: () => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  items: [],
  add: item =>
    set(state => ({
      items: [
        {
          ...item,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          read: false,
        },
        ...state.items,
      ].slice(0, 30),
    })),
  remove: id =>
    set(state => ({
      items: state.items.filter(i => i.id !== id),
    })),
  markRead: id =>
    set(state => ({
      items: state.items.map(i => (i.id === id ? { ...i, read: true } : i)),
    })),
  markAllRead: () =>
    set(state => ({
      items: state.items.map(item => ({ ...item, read: true })),
    })),
  unreadCount: () => get().items.filter(item => !item.read).length,
  clear: () => set(() => ({ items: [] })),
}))

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

export function useRealtimeNotifications(enabled = true) {
  const queryClient = useQueryClient()
  const addNotification = useNotificationStore(state => state.add)
  const setOnline = usePresenceStore(state => state.setOnline)
  const setOffline = usePresenceStore(state => state.setOffline)
  const setInitialOnlineUsers = usePresenceStore(
    state => state.setInitialOnlineUsers
  )
  const accessToken = useAuthSessionStore(state => state.accessToken)

  const handleRealtimeMessage = useCallback(
    (event: MessageEvent) => {
      let data: RealtimeEvent
      try {
        data = JSON.parse(event.data) as RealtimeEvent
      } catch {
        return
      }

      logger.debug('[realtime] event received', {
        type: data.type,
        payload: data.payload,
      })

      const payload = data.payload ?? {}
      switch (data.type) {
        case 'post_created':
          void queryClient.invalidateQueries({ queryKey: ['posts'] })
          break
        case 'post_reaction_updated': {
          const postID = asNumber(payload.post_id)
          const likesCount = asNumber(payload.likes_count)
          const commentsCount = asNumber(payload.comments_count)
          if (!postID || likesCount === null) break

          queryClient.setQueryData<
            { likes_count?: number; comments_count?: number } | undefined
          >(['posts', 'detail', postID], oldPost => {
            if (!oldPost) return oldPost
            return {
              ...oldPost,
              likes_count: likesCount,
              comments_count:
                commentsCount ?? (oldPost.comments_count as number | undefined),
            }
          })

          const infiniteQueries = queryClient
            .getQueryCache()
            .findAll({ queryKey: ['posts', 'infinite'] })
          for (const query of infiniteQueries) {
            queryClient.setQueryData<InfinitePostsData | undefined>(
              query.queryKey,
              oldData => {
                if (!oldData) return oldData
                return {
                  ...oldData,
                  pages: oldData.pages.map(page =>
                    page.map(post =>
                      post.id === postID
                        ? {
                            ...post,
                            likes_count: likesCount,
                            comments_count:
                              commentsCount ??
                              (post.comments_count as number | undefined),
                          }
                        : post
                    )
                  ),
                }
              }
            )
          }
          break
        }
        case 'comment_created':
        case 'comment_updated':
        case 'comment_deleted': {
          const postID = asNumber(payload.post_id)
          if (!postID) break

          const commentsCount = asNumber(payload.comments_count)
          const commentID = asNumber(payload.comment_id)
          const comment =
            (payload.comment as RealtimeComment | undefined) ?? null

          queryClient.setQueryData<
            { likes_count?: number; comments_count?: number } | undefined
          >(['posts', 'detail', postID], oldPost => {
            if (!oldPost || commentsCount === null) return oldPost
            return {
              ...oldPost,
              comments_count: commentsCount,
            }
          })

          const infiniteQueries = queryClient
            .getQueryCache()
            .findAll({ queryKey: ['posts', 'infinite'] })
          for (const query of infiniteQueries) {
            queryClient.setQueryData<InfinitePostsData | undefined>(
              query.queryKey,
              oldData => {
                if (!oldData || commentsCount === null) return oldData
                return {
                  ...oldData,
                  pages: oldData.pages.map(page =>
                    page.map(post =>
                      post.id === postID
                        ? {
                            ...post,
                            comments_count: commentsCount,
                          }
                        : post
                    )
                  ),
                }
              }
            )
          }

          queryClient.setQueryData<RealtimeComment[] | undefined>(
            ['comments', 'list', postID],
            oldComments => {
              if (!oldComments) return oldComments
              if (data.type === 'comment_created' && comment) {
                if (oldComments.some(c => c.id === comment.id)) {
                  return oldComments
                }
                return [comment, ...oldComments]
              }
              if (data.type === 'comment_updated' && comment) {
                return oldComments.map(c =>
                  c.id === comment.id ? { ...c, ...comment } : c
                )
              }
              if (data.type === 'comment_deleted') {
                const targetID = commentID ?? comment?.id
                if (!targetID) return oldComments
                return oldComments.filter(c => c.id !== targetID)
              }
              return oldComments
            }
          )
          break
        }
        case 'message_received': {
          const isGroupMessage = payload.is_group === true
          if (isGroupMessage) {
            break
          }
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'conversations'],
          })
          const path = window.location.pathname
          const inMessagingView = path === '/chat' || path.startsWith('/chat/')

          if (inMessagingView) {
            break
          }

          const username = asString(
            (payload.from_user as Record<string, unknown>)?.username
          )
          const preview = asString(payload.preview)
          const conversationId = asNumber(payload.conversation_id)
          const fromUserId = asNumber(
            (payload.from_user as Record<string, unknown>)?.id
          )
          if (username) {
            const desc = preview ? `"${preview}"` : 'New message'
            addNotification({
              title: `${username} sent a message`,
              description: desc,
              createdAt: new Date().toISOString(),
              meta: {
                type: 'message',
                conversationId: conversationId ?? undefined,
                userId: fromUserId ?? undefined,
              },
            })
          }
          break
        }
        case 'chat_mention': {
          void queryClient.invalidateQueries({
            queryKey: ['moderation', 'mentions'],
          })
          const preview = asString(payload.preview)
          const fromUserID = asNumber(payload.from_user_id)
          addNotification({
            title: 'You were mentioned',
            description: preview
              ? `"${preview.slice(0, 120)}"`
              : 'A new mention in chat',
            createdAt: new Date().toISOString(),
            meta: {
              type: 'chat_mention',
              userId: fromUserID ?? undefined,
            },
          })
          break
        }
        case 'friend_request_received': {
          void queryClient.invalidateQueries({ queryKey: ['friends'] })
          const username = asString(
            (payload.from_user as Record<string, unknown>)?.username
          )
          const requestId = asNumber(payload.request_id ?? payload.id)
          const fromUserId = asNumber(
            (payload.from_user as Record<string, unknown>)?.id
          )
          if (username) {
            toast.message('New friend request', {
              description: `${username} sent you a request`,
            })
            addNotification({
              title: 'New friend request',
              description: `${username} sent you a request`,
              createdAt: new Date().toISOString(),
              meta: {
                type: 'friend_request',
                requestId: requestId ?? undefined,
                userId: fromUserId ?? undefined,
              },
            })
          }
          break
        }
        case 'friend_request_accepted': {
          void queryClient.invalidateQueries({ queryKey: ['friends'] })
          const username = asString(
            (payload.friend_user as Record<string, unknown>)?.username
          )
          if (username) {
            toast.success(`${username} accepted your friend request`)
            addNotification({
              title: 'Friend request accepted',
              description: `${username} is now your friend`,
              createdAt: new Date().toISOString(),
            })
          }
          break
        }
        case 'friend_added':
        case 'friend_removed':
        case 'friend_request_sent':
        case 'friend_request_rejected':
        case 'friend_request_cancelled':
          void queryClient.invalidateQueries({ queryKey: ['friends'] })
          break
        case 'friend_presence_changed': {
          const friendID = asNumber(payload.user_id)
          const status = asString(payload.status)
          if (!friendID || !status) break

          // Only update the presence store here. ChatDock's subscribeOnPresence
          // handler owns the user-facing toast so we don't show a duplicate.
          if (status === 'online') {
            setOnline(friendID)
          } else if (status === 'offline') {
            setOffline(friendID)
          }
          break
        }
        case 'friends_online_snapshot': {
          const userIDs = Array.isArray(payload.user_ids)
            ? (payload.user_ids as unknown[])
                .map(id => asNumber(id))
                .filter((id): id is number => id !== null)
            : []
          setInitialOnlineUsers(userIDs)
          break
        }
        case 'sanctum_request_created': {
          void queryClient.invalidateQueries({
            queryKey: ['sanctums', 'requests', 'admin', 'pending'],
          })
          const name = asString(payload.requested_name)
          if (name) {
            toast.info('New Sanctum Request', {
              description: `A request for "${name}" has been submitted.`,
            })
          }
          break
        }
        case 'sanctum_request_reviewed': {
          void queryClient.invalidateQueries({
            queryKey: ['sanctums', 'requests', 'admin'],
          })
          void queryClient.invalidateQueries({
            queryKey: ['sanctums', 'list'],
          })

          const status = asString(payload.status)
          const userStr = localStorage.getItem('user')
          if (userStr) {
            try {
              const user = JSON.parse(userStr)
              if (user?.id) {
                void queryClient.invalidateQueries({
                  queryKey: ['sanctums', 'requests', 'me'],
                })

                if (status === 'approved') {
                  toast.success('Sanctum request approved!', {
                    description:
                      'Your request to create a sanctum was accepted.',
                  })
                } else if (status === 'rejected') {
                  toast.error('Sanctum request rejected', {
                    description: 'Your request to create a sanctum was denied.',
                  })
                }
              }
            } catch (_e) {
              // ignore
            }
          }
          break
        }
        case 'game_room_updated': {
          const roomId = asNumber(payload.room_id)
          dispatchGameRoomRealtimeUpdate({
            roomId: roomId ?? undefined,
          })
          break
        }
      }
    },
    [queryClient, addNotification, setOnline, setOffline, setInitialOnlineUsers]
  )

  const wsEnabled = enabled && !!accessToken

  logger.debug('[realtime] WebSocket state', {
    wsEnabled,
    enabled,
    hasAccessToken: !!accessToken,
  })

  const { reconnect, setPlannedReconnect } = useManagedWebSocket({
    enabled: wsEnabled,
    debugLabel: 'realtime-notifications',
    createSocket: async () => {
      logger.debug('[realtime] createSocket called, requesting ticket...')
      try {
        const ws = await createTicketedWS({ path: '/api/ws' })
        logger.debug('[realtime] WebSocket created successfully')
        return ws
      } catch (error) {
        logger.error('[realtime] createSocket failed:', error)
        throw error
      }
    },
    onOpen: () => {
      logger.debug('[realtime] notifications websocket opened')
      dispatchGameRoomRealtimeUpdate()
    },
    onMessage: (_ws, event) => {
      handleRealtimeMessage(event)
    },
    onError: (_ws, error, meta) => {
      if (meta.planned) {
        return
      }
      logger.error('[realtime] websocket error', error)
    },
    reconnectDelaysMs: DEFAULT_RECONNECT_DELAYS,
  })

  useEffect(() => {
    if (!wsEnabled) {
      setInitialOnlineUsers([])
    }
  }, [wsEnabled, setInitialOnlineUsers])

  useTokenRefreshReconnect({
    token: accessToken,
    wsEnabled,
    reconnect,
    setPlannedReconnect,
    debugLabel: 'realtime-notifications',
  })
}
