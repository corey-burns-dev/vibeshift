import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import type { GameChatMessage } from '@/components/games/GameChat'

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
  const historyLoadedRef = useRef(false)
  const previousRoomIdRef = useRef<number | null>(null)

  const { data: history, isSuccess } = useQuery({
    queryKey: ['gameRoomMessages', roomId],
    queryFn: async () => {
      if (!roomId) return []
      return apiClient.getGameRoomMessages(roomId)
    },
    enabled: !!roomId,
    // Don't refetch on window focus — messages come in via WS
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Seed messages from history on first successful load.
  // We avoid overwriting messages that may have arrived via WS before history
  // loaded by merging: history goes first, then any already-received WS messages.
  useEffect(() => {
    if (!isSuccess || !history || historyLoadedRef.current) return
    historyLoadedRef.current = true
    setMessages(prev => {
      // Deduplicate: keep WS messages that aren't in the history snapshot
      const historyTexts = new Set(history.map(m => `${m.user_id}|${m.text}`))
      const newOnly = prev.filter(
        m => !historyTexts.has(`${m.user_id}|${m.text}`)
      )
      return [
        ...history.map(m => ({
          user_id: m.user_id,
          username: m.username,
          text: m.text,
        })),
        ...newOnly,
      ]
    })
  }, [isSuccess, history])

  // Reset when roomId changes (e.g. rematch navigates to a new room)
  useEffect(() => {
    if (previousRoomIdRef.current === roomId) return
    previousRoomIdRef.current = roomId
    historyLoadedRef.current = false
    setMessages([])
  }, [roomId])

  const addMessage = useCallback((msg: GameChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  return { messages, addMessage }
}
