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
  debugLabel,
}: {
  token: string | null | undefined
  wsEnabled: boolean
  reconnect: (force?: boolean) => void
  setPlannedReconnect: (value: boolean) => void
  debugLabel?: string
}) {
  const previousTokenRef = useRef<string | null>(null)
  const label = debugLabel?.trim() || 'default'

  useEffect(() => {
    const currentToken = token ?? null

    if (!wsEnabled) {
      if (previousTokenRef.current !== currentToken) {
        console.log(
          `[ws-token-refresh:${label}] websocket disabled, tracking token baseline only`
        )
      }
      previousTokenRef.current = currentToken
      return
    }

    const previousToken = previousTokenRef.current
    previousTokenRef.current = currentToken

    if (!previousToken || !currentToken || previousToken === currentToken) {
      return
    }

    console.log(
      `[ws-token-refresh:${label}] token changed, triggering planned reconnect`,
      {
        previousTokenTail: previousToken.slice(-8),
        currentTokenTail: currentToken.slice(-8),
      }
    )
    setPlannedReconnect(true)
    reconnect(true)
  }, [wsEnabled, token, reconnect, setPlannedReconnect, label])
}
