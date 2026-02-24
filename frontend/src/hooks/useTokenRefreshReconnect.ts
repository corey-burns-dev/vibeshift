import { useEffect, useRef } from 'react'

/**
 * Triggers a planned WebSocket reconnect whenever the auth token changes.
 *
 * Both `useRealtimeNotifications` and `useGameRoomSession` need this behavior.
 * The ref tracks the previous token so we only reconnect on an actual change,
 * not on initial mount or when the socket is disabled.
 */
export function useTokenRefreshReconnect({
  token,
  wsEnabled,
  reconnect,
  setPlannedReconnect,
}: {
  token: string | null | undefined
  wsEnabled: boolean
  reconnect: (force?: boolean) => void
  setPlannedReconnect: (value: boolean) => void
}) {
  const previousTokenRef = useRef<string | null>(null)

  useEffect(() => {
    const currentToken = token ?? null

    if (!wsEnabled) {
      previousTokenRef.current = currentToken
      return
    }

    const previousToken = previousTokenRef.current
    previousTokenRef.current = currentToken

    if (!previousToken || !currentToken || previousToken === currentToken) {
      return
    }

    setPlannedReconnect(true)
    reconnect(true)
  }, [wsEnabled, token, reconnect, setPlannedReconnect])
}
