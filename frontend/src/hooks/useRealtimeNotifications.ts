import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { apiClient } from '@/api/client'
import { usePresenceStore } from '@/hooks/usePresence'
import { getWsBaseUrl } from '@/lib/chat-utils'

type RealtimeEventType =
  | 'post_created'
  | 'post_reaction_updated'
  | 'comment_created'
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
  }
}

interface NotificationStore {
  items: AppNotification[]
  add: (item: Omit<AppNotification, 'id' | 'read'>) => void
  remove: (id: string) => void
  markRead: (id: string) => void
  markAllRead: () => void
  unreadCount: () => number
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
}))

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

export function useRealtimeNotifications(enabled = true) {
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<number | null>(null)
  const addNotification = useNotificationStore(state => state.add)
  const setOnline = usePresenceStore(state => state.setOnline)
  const setOffline = usePresenceStore(state => state.setOffline)
  const setInitialOnlineUsers = usePresenceStore(
    state => state.setInitialOnlineUsers
  )

  const openDirectMessage = useCallback(async (userID: number) => {
    try {
      const conv = await apiClient.createConversation({
        participant_ids: [userID],
      })
      window.location.href = `/messages/${conv.id}`
    } catch {
      // Silently ignore failures; user can still navigate manually.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const token = localStorage.getItem('token')
    if (!token) return

    const wsUrl = `${getWsBaseUrl()}/api/ws?token=${token}`

    let closedByEffect = false
    let ws: WebSocket | null = null
    let connectTimer: number | null = null

    const connect = () => {
      if (closedByEffect) return
      ws = new WebSocket(wsUrl)

      ws.onmessage = event => {
        let data: RealtimeEvent
        try {
          data = JSON.parse(event.data) as RealtimeEvent
        } catch {
          return
        }

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
                  commentsCount ??
                  (oldPost.comments_count as number | undefined),
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
            const inMessagingView =
              path === '/messages' ||
              path.startsWith('/messages/') ||
              path === '/chat' ||
              path.startsWith('/chat/')

            if (inMessagingView) {
              break
            }

            const username = asString(
              (payload.from_user as Record<string, unknown>)?.username
            )
            const preview = asString(payload.preview)
            if (username) {
              const desc = preview ? `"${preview}"` : 'New message'
              addNotification({
                title: `${username} sent a message`,
                description: desc,
                createdAt: new Date().toISOString(),
              })
            }
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
                meta: { type: 'friend_request', requestId, userId: fromUserId },
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
            const username = asString(payload.username) ?? 'A friend'
            if (!friendID || !status) break

            if (status === 'online') {
              setOnline(friendID)
              toast.message(`${username} is online`, {
                description: 'Tap to open chat',
                duration: 7000,
                className: 'border border-emerald-500/40',
                action: {
                  label: 'Message',
                  onClick: () => {
                    void openDirectMessage(friendID)
                  },
                },
              })
            } else if (status === 'offline') {
              setOffline(friendID)
              toast.message(`${username} went offline`, {
                description: 'They are currently offline',
                duration: 7000,
                className: 'border border-slate-500/40',
              })
            }
            break
          }
          case 'friends_online_snapshot': {
            const userIDs = Array.isArray(payload.user_ids)
              ? (payload.user_ids as unknown[])
                  .map(id => asNumber(id))
                  .filter((id): id is number => id !== null)
              : []
            // Always apply snapshot, even when empty, so stale online badges clear.
            setInitialOnlineUsers(userIDs)
            break
          }
        }
      }

      ws.onclose = () => {
        if (closedByEffect) return
        reconnectTimeoutRef.current = window.setTimeout(connect, 1500)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    // Small delay avoids the "closed before established" warning from
    // React 19 StrictMode's double-invocation of effects in dev.
    connectTimer = window.setTimeout(connect, 0)

    return () => {
      closedByEffect = true
      if (connectTimer !== null) {
        window.clearTimeout(connectTimer)
        connectTimer = null
      }
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      ws?.close()
    }
  }, [
    enabled,
    queryClient,
    addNotification,
    setOnline,
    setOffline,
    setInitialOnlineUsers,
    openDirectMessage,
  ])
}
