import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import type { GameChatMessage } from '@/components/games/GameChat'

function buildMessageKey(message: Pick<GameChatMessage, 'user_id' | 'text'>) {
  return `${message.user_id}|${message.text}`
}

function mergeHistoryWithSocketMessages(
  history: GameChatMessage[],
  socketMessages: GameChatMessage[]
) {
  // Remove only as many overlapping WS messages as history already contains.
  const remainingHistoryCounts = new Map<string, number>()
  for (const message of history) {
    const key = buildMessageKey(message)
    remainingHistoryCounts.set(key, (remainingHistoryCounts.get(key) ?? 0) + 1)
  }

  const socketOnlyMessages = socketMessages.filter(message => {
    const key = buildMessageKey(message)
    const remaining = remainingHistoryCounts.get(key) ?? 0
    if (remaining > 0) {
      remainingHistoryCounts.set(key, remaining - 1)
      return false
    }
    return true
  })

  return [...history, ...socketOnlyMessages]
}

/**
 * useGameChat manages the chat message list for a game room.
 *
 * It fetches the persisted message history from the REST API on mount (so
 * messages are visible even if the user navigated away and back), and
 * exposes `addMessage` for the parent to call when a new `chat` WebSocket
 * event arrives.
 */
export function useGameChat(roomId: number | null) {
  const [messages, setMessages] = useState<GameChatMessage[]>([])
  const latestAppliedHistoryAtRef = useRef<number | null>(null)
  const previousRoomIdRef = useRef<number | null>(null)

  const {
    data: history,
    isSuccess,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['gameRoomMessages', roomId],
    queryFn: async () => {
      if (!roomId) return []
      return apiClient.getGameRoomMessages(roomId)
    },
    enabled: !!roomId,
    // Chat updates come through WS while mounted.
    refetchOnWindowFocus: false,
    // Always refresh on mount so returning to the room gets persisted updates.
    refetchOnMount: 'always',
  })

  // Apply each distinct history payload once. If cache data is shown first and
  // then refreshed, the newer payload is applied when dataUpdatedAt changes.
  useEffect(() => {
    if (!isSuccess || !history) return
    if (latestAppliedHistoryAtRef.current === dataUpdatedAt) return
    latestAppliedHistoryAtRef.current = dataUpdatedAt

    setMessages(prev => {
      const historyMessages: GameChatMessage[] = history.map(message => ({
        user_id: message.user_id,
        username: message.username,
        text: message.text,
      }))
      return mergeHistoryWithSocketMessages(historyMessages, prev)
    })
  }, [dataUpdatedAt, history, isSuccess])

  // Reset when roomId changes (e.g. rematch navigates to a new room)
  useEffect(() => {
    if (previousRoomIdRef.current === roomId) return
    previousRoomIdRef.current = roomId
    latestAppliedHistoryAtRef.current = null
    setMessages([])
  }, [roomId])

  const addMessage = useCallback((msg: GameChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  return { messages, addMessage }
}
