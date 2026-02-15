import { useCallback, useEffect, useRef, useState } from 'react'

export type ManagedWebSocketState = 'disconnected' | 'connecting' | 'connected'

export interface ManagedWebSocketCloseMeta {
  planned: boolean
}

interface UseManagedWebSocketOptions {
  enabled: boolean
  createSocket: () => Promise<WebSocket>
  onOpen?: (ws: WebSocket, event: Event) => void
  onMessage?: (ws: WebSocket, event: MessageEvent) => void
  onError?: (
    ws: WebSocket,
    event: Event,
    meta: ManagedWebSocketCloseMeta
  ) => void
  onClose?: (
    ws: WebSocket,
    event: CloseEvent,
    meta: ManagedWebSocketCloseMeta
  ) => void
  reconnectDelaysMs?: number[]
  autoPong?: boolean
}

const DEFAULT_RECONNECT_DELAYS = [2000, 5000, 10000]
const WS_READY_CONNECTING = 0
const WS_READY_OPEN = 1

export function useManagedWebSocket({
  enabled,
  createSocket,
  onOpen,
  onMessage,
  onError,
  onClose,
  reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS,
  autoPong = true,
}: UseManagedWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const connectRef = useRef<() => void>(() => {})
  const unmountedRef = useRef(false)
  const enabledRef = useRef(enabled)

  const createSocketRef = useRef(createSocket)
  const onOpenRef = useRef(onOpen)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)
  const onCloseRef = useRef(onClose)
  const reconnectDelaysRef = useRef(reconnectDelaysMs)
  const autoPongRef = useRef(autoPong)

  const plannedReconnectRef = useRef(false)
  const [plannedReconnect, setPlannedReconnectState] = useState(false)
  const [connectionState, setConnectionState] =
    useState<ManagedWebSocketState>('disconnected')

  useEffect(() => {
    createSocketRef.current = createSocket
  }, [createSocket])

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    reconnectDelaysRef.current =
      reconnectDelaysMs.length > 0
        ? reconnectDelaysMs
        : DEFAULT_RECONNECT_DELAYS
  }, [reconnectDelaysMs])

  useEffect(() => {
    autoPongRef.current = autoPong
  }, [autoPong])

  const handlePingMessage = useCallback(
    (ws: WebSocket, event: MessageEvent) => {
      if (!autoPongRef.current || ws.readyState !== WS_READY_OPEN) {
        return false
      }

      if (typeof event.data !== 'string') {
        return false
      }

      if (event.data === 'PING') {
        ws.send('PONG')
        return true
      }

      try {
        const payload = JSON.parse(event.data) as { type?: unknown }
        if (payload.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }))
          return true
        }
      } catch {
        return false
      }

      return false
    },
    []
  )

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const setPlannedReconnect = useCallback((planned: boolean) => {
    plannedReconnectRef.current = planned
    setPlannedReconnectState(planned)
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current || unmountedRef.current) {
      return
    }
    if (reconnectTimeoutRef.current !== null) {
      return
    }

    const delays = reconnectDelaysRef.current
    const attempt = reconnectAttemptsRef.current
    const idx = Math.min(attempt, delays.length - 1)
    const delay = delays[idx]

    reconnectAttemptsRef.current = attempt + 1
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null
      connectRef.current()
    }, delay)
  }, [])

  const close = useCallback(
    (planned = false) => {
      clearReconnectTimer()
      if (planned) {
        setPlannedReconnect(true)
      }

      const ws = wsRef.current
      if (!ws) {
        setConnectionState('disconnected')
        return
      }

      wsRef.current = null
      if (
        ws.readyState === WS_READY_OPEN ||
        ws.readyState === WS_READY_CONNECTING
      ) {
        ws.close()
      }
      setConnectionState('disconnected')
    },
    [clearReconnectTimer, setPlannedReconnect]
  )

  const connect = useCallback(() => {
    if (!enabledRef.current || unmountedRef.current) {
      console.log(
        '[ws-managed] Connect skipped: enabled=',
        enabledRef.current,
        'unmounted=',
        unmountedRef.current
      )
      return
    }
    if (
      wsRef.current &&
      (wsRef.current.readyState === WS_READY_OPEN ||
        wsRef.current.readyState === WS_READY_CONNECTING)
    ) {
      console.log(
        '[ws-managed] Connect skipped: already connected or connecting, readyState=',
        wsRef.current.readyState
      )
      return
    }

    console.log('[ws-managed] State: connecting')
    setConnectionState('connecting')

    void (async () => {
      let ws: WebSocket
      try {
        console.log('[ws-managed] Calling createSocket...')
        ws = await createSocketRef.current()
        console.log(
          '[ws-managed] WebSocket created, readyState=',
          ws.readyState
        )
      } catch (err) {
        console.error('[ws-managed] createSocket failed:', err)
        setConnectionState('disconnected')
        scheduleReconnect()
        return
      }

      if (!enabledRef.current || unmountedRef.current) {
        console.log(
          '[ws-managed] Component disabled/unmounted after socket creation, closing'
        )
        ws.close()
        setConnectionState('disconnected')
        return
      }

      wsRef.current = ws

      ws.onopen = event => {
        if (wsRef.current !== ws) return

        console.log('[ws-managed] State: connected')
        reconnectAttemptsRef.current = 0
        setConnectionState('connected')
        setPlannedReconnect(false)
        onOpenRef.current?.(ws, event)
      }

      ws.onmessage = event => {
        if (wsRef.current !== ws) return
        if (handlePingMessage(ws, event)) return
        onMessageRef.current?.(ws, event)
      }

      ws.onerror = event => {
        if (wsRef.current !== ws) return
        console.error('[ws-managed] WebSocket error event:', event)
        onErrorRef.current?.(ws, event, {
          planned: plannedReconnectRef.current,
        })
      }

      ws.onclose = event => {
        if (wsRef.current === ws) {
          wsRef.current = null
        }

        console.log(
          '[ws-managed] State: disconnected, code=',
          event?.code,
          'reason=',
          event?.reason,
          'wasClean=',
          event?.wasClean
        )
        setConnectionState('disconnected')

        const meta = { planned: plannedReconnectRef.current }
        onCloseRef.current?.(ws, event, meta)
        scheduleReconnect()
      }
    })()
  }, [handlePingMessage, scheduleReconnect, setPlannedReconnect])

  connectRef.current = connect

  const reconnect = useCallback(
    (planned = false) => {
      clearReconnectTimer()
      reconnectAttemptsRef.current = 0
      if (planned) {
        setPlannedReconnect(true)
      }

      const ws = wsRef.current
      if (ws) {
        ws.close()
        return
      }

      connectRef.current()
    },
    [clearReconnectTimer, setPlannedReconnect]
  )

  useEffect(() => {
    enabledRef.current = enabled

    if (!enabled) {
      reconnectAttemptsRef.current = 0
      close(true)
      return
    }

    connectRef.current()
  }, [enabled, close])

  useEffect(() => {
    unmountedRef.current = false // Reset on mount (fixes React StrictMode remount)
    return () => {
      unmountedRef.current = true
      enabledRef.current = false
      clearReconnectTimer()
      const ws = wsRef.current
      wsRef.current = null
      if (
        ws &&
        (ws.readyState === WS_READY_OPEN ||
          ws.readyState === WS_READY_CONNECTING)
      ) {
        ws.close()
      }
      setConnectionState('disconnected')
    }
  }, [clearReconnectTimer])

  return {
    wsRef,
    connectionState,
    plannedReconnect,
    setPlannedReconnect,
    reconnect,
    close,
  }
}
