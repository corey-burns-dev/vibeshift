import { useCallback, useEffect, useRef, useState } from 'react'

export type ManagedWebSocketState = 'disconnected' | 'connecting' | 'connected'

export interface ManagedWebSocketCloseMeta {
  planned: boolean
}

interface UseManagedWebSocketOptions {
  enabled: boolean
  debugLabel?: string
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
  /**
   * Connection handshake timeout in milliseconds.
   * If the WebSocket doesn't receive a 'connected' message within this time,
   * it will close and reconnect. Set to 0 to disable.
   * @default 15000 (15 seconds) — raised from 5s to accommodate production
   * latency (Redis ticket validation + DB lookup + hub registration can exceed
   * 5s under load, causing spurious reconnect storms).
   */
  handshakeTimeoutMs?: number
}

export const DEFAULT_RECONNECT_DELAYS = [2000, 5000, 10000]
const WS_READY_CONNECTING = 0
const WS_READY_OPEN = 1

export function useManagedWebSocket({
  enabled,
  debugLabel,
  createSocket,
  onOpen,
  onMessage,
  onError,
  onClose,
  reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS,
  autoPong = true,
  handshakeTimeoutMs = 15000,
}: UseManagedWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const socketIdByInstanceRef = useRef<WeakMap<WebSocket, number>>(
    new WeakMap()
  )
  const socketCloseCauseRef = useRef<Map<number, string>>(new Map())
  const nextSocketIdRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const connectRef = useRef<() => void>(() => {})
  const unmountedRef = useRef(false)
  const enabledRef = useRef(enabled)
  const debugLabelRef = useRef(debugLabel)
  const handshakeTimeoutRef = useRef<number | null>(null)
  const handshakeCompletedRef = useRef<boolean>(false)

  const createSocketRef = useRef(createSocket)
  const onOpenRef = useRef(onOpen)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)
  const onCloseRef = useRef(onClose)
  const reconnectDelaysRef = useRef(reconnectDelaysMs)
  const autoPongRef = useRef(autoPong)
  const handshakeTimeoutMsRef = useRef(handshakeTimeoutMs)

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

  useEffect(() => {
    handshakeTimeoutMsRef.current = handshakeTimeoutMs
  }, [handshakeTimeoutMs])

  useEffect(() => {
    debugLabelRef.current = debugLabel
  }, [debugLabel])

  const formatLogPrefix = useCallback((socketID?: number | null) => {
    const label = debugLabelRef.current?.trim() || 'default'
    const idLabel = socketID ?? '?'
    return `[ws-managed:${label}:${idLabel}]`
  }, [])

  const getSocketID = useCallback((ws: WebSocket | null): number | null => {
    if (!ws) {
      return null
    }
    return socketIdByInstanceRef.current.get(ws) ?? null
  }, [])

  const markCloseCause = useCallback(
    (ws: WebSocket | null, cause: string, explicitSocketID?: number) => {
      const socketID = explicitSocketID ?? getSocketID(ws)
      if (socketID === null) {
        return
      }
      socketCloseCauseRef.current.set(socketID, cause)
      console.log(formatLogPrefix(socketID), 'Close requested:', cause)
    },
    [formatLogPrefix, getSocketID]
  )

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

  const handleConnectedMessage = useCallback(
    (ws: WebSocket, event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        return false
      }

      try {
        const payload = JSON.parse(event.data) as { type?: unknown }
        if (payload.type === 'connected') {
          // Mark handshake as completed and clear timeout
          handshakeCompletedRef.current = true
          if (handshakeTimeoutRef.current !== null) {
            clearTimeout(handshakeTimeoutRef.current)
            handshakeTimeoutRef.current = null
          }
          console.log(
            formatLogPrefix(getSocketID(ws)),
            'Received "connected" message, handshake complete'
          )
          return true
        }
      } catch {
        return false
      }

      return false
    },
    [formatLogPrefix, getSocketID]
  )

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const clearHandshakeTimeout = useCallback(() => {
    if (handshakeTimeoutRef.current !== null) {
      window.clearTimeout(handshakeTimeoutRef.current)
      handshakeTimeoutRef.current = null
    }
    handshakeCompletedRef.current = false
  }, [])

  const setPlannedReconnect = useCallback((planned: boolean) => {
    plannedReconnectRef.current = planned
    setPlannedReconnectState(planned)
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current || unmountedRef.current) {
      console.log(
        formatLogPrefix(getSocketID(wsRef.current)),
        'Reconnect skipped: enabled=',
        enabledRef.current,
        'unmounted=',
        unmountedRef.current
      )
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
    console.log(
      formatLogPrefix(getSocketID(wsRef.current)),
      `Scheduling reconnect attempt ${attempt + 1} in ${delay}ms`
    )
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null
      connectRef.current()
    }, delay)
  }, [formatLogPrefix, getSocketID])

  const close = useCallback(
    (planned = false) => {
      clearReconnectTimer()
      clearHandshakeTimeout()
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
        markCloseCause(
          ws,
          planned ? 'close(planned=true)' : 'close(planned=false)'
        )
        ws.close()
      }
      setConnectionState('disconnected')
    },
    [
      clearReconnectTimer,
      clearHandshakeTimeout,
      setPlannedReconnect,
      markCloseCause,
    ]
  )

  const connect = useCallback(() => {
    if (!enabledRef.current || unmountedRef.current) {
      console.log(
        formatLogPrefix(getSocketID(wsRef.current)),
        'Connect skipped: enabled=',
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
        formatLogPrefix(getSocketID(wsRef.current)),
        'Connect skipped: already connected or connecting, readyState=',
        wsRef.current.readyState
      )
      return
    }

    console.log(formatLogPrefix(), 'State: connecting')
    setConnectionState('connecting')

    void (async () => {
      const socketID = nextSocketIdRef.current + 1
      nextSocketIdRef.current = socketID
      let ws: WebSocket
      try {
        console.log(formatLogPrefix(socketID), 'Calling createSocket...')
        ws = await createSocketRef.current()
        console.log(
          formatLogPrefix(socketID),
          'WebSocket created, readyState=',
          ws.readyState
        )
      } catch (err) {
        console.error(formatLogPrefix(socketID), 'createSocket failed:', err)
        setConnectionState('disconnected')
        scheduleReconnect()
        return
      }

      if (!enabledRef.current || unmountedRef.current) {
        console.log(
          formatLogPrefix(socketID),
          'Component disabled/unmounted after socket creation, closing'
        )
        markCloseCause(ws, 'disabled-or-unmounted-after-create', socketID)
        ws.close()
        setConnectionState('disconnected')
        return
      }

      socketIdByInstanceRef.current.set(ws, socketID)
      wsRef.current = ws

      ws.onopen = event => {
        if (wsRef.current !== ws) return

        console.log(formatLogPrefix(socketID), 'State: connected')
        reconnectAttemptsRef.current = 0
        setConnectionState('connected')
        setPlannedReconnect(false)

        // Set up connection handshake timeout if enabled
        const timeoutMs = handshakeTimeoutMsRef.current
        if (timeoutMs > 0) {
          const connectStartTime = Date.now()
          clearHandshakeTimeout()
          console.log(
            `${formatLogPrefix(socketID)} Waiting for 'connected' message (${timeoutMs}ms timeout)...`
          )
          handshakeTimeoutRef.current = window.setTimeout(() => {
            if (!handshakeCompletedRef.current && wsRef.current === ws) {
              const elapsed = Date.now() - connectStartTime
              console.warn(
                `${formatLogPrefix(socketID)} Connection handshake timeout after ${elapsed}ms, reconnecting...`
              )
              // Close the WebSocket to trigger reconnection
              markCloseCause(ws, 'handshake-timeout', socketID)
              ws.close()
            }
          }, timeoutMs)
        }

        onOpenRef.current?.(ws, event)
      }

      ws.onmessage = event => {
        if (wsRef.current !== ws) return
        if (handlePingMessage(ws, event)) return
        // Check for connected message (handshake completion)
        if (handleConnectedMessage(ws, event)) {
          // Still pass connected message to consumer's handler
          onMessageRef.current?.(ws, event)
          return
        }
        onMessageRef.current?.(ws, event)
      }

      ws.onerror = event => {
        if (wsRef.current !== ws) return
        clearHandshakeTimeout()
        console.error(
          formatLogPrefix(socketID),
          'WebSocket error event:',
          event,
          'planned=',
          plannedReconnectRef.current
        )
        onErrorRef.current?.(ws, event, {
          planned: plannedReconnectRef.current,
        })
      }

      ws.onclose = event => {
        clearHandshakeTimeout()
        if (wsRef.current === ws) {
          wsRef.current = null
        }
        const closeCause =
          socketCloseCauseRef.current.get(socketID) ?? 'external-or-peer'
        socketCloseCauseRef.current.delete(socketID)

        console.log(
          formatLogPrefix(socketID),
          'State: disconnected, code=',
          event?.code,
          'reason=',
          event?.reason,
          'wasClean=',
          event?.wasClean,
          'planned=',
          plannedReconnectRef.current,
          'closeCause=',
          closeCause
        )
        if (closeCause === 'external-or-peer' && event?.code === 1001) {
          console.warn(
            formatLogPrefix(socketID),
            '1001 close with no tracked internal close cause; likely browser lifecycle or external ws.close()'
          )
        }
        setConnectionState('disconnected')

        const meta = { planned: plannedReconnectRef.current }
        onCloseRef.current?.(ws, event, meta)
        scheduleReconnect()
      }
    })()
  }, [
    handlePingMessage,
    handleConnectedMessage,
    clearHandshakeTimeout,
    scheduleReconnect,
    setPlannedReconnect,
    formatLogPrefix,
    markCloseCause,
    getSocketID,
  ])

  connectRef.current = connect

  const reconnect = useCallback(
    (planned = false) => {
      clearReconnectTimer()
      clearHandshakeTimeout()
      reconnectAttemptsRef.current = 0
      if (planned) {
        setPlannedReconnect(true)
      }

      const ws = wsRef.current
      if (ws) {
        markCloseCause(
          ws,
          planned ? 'reconnect(planned=true)' : 'reconnect(planned=false)'
        )
        ws.close()
        return
      }

      connectRef.current()
    },
    [
      clearReconnectTimer,
      clearHandshakeTimeout,
      setPlannedReconnect,
      markCloseCause,
    ]
  )

  useEffect(() => {
    enabledRef.current = enabled
    console.log(
      formatLogPrefix(getSocketID(wsRef.current)),
      'Enabled changed:',
      enabled
    )

    if (!enabled) {
      reconnectAttemptsRef.current = 0
      close(true)
      return
    }

    connectRef.current()
  }, [enabled, close, formatLogPrefix, getSocketID])

  useEffect(() => {
    unmountedRef.current = false // Reset on mount (fixes React StrictMode remount)
    return () => {
      unmountedRef.current = true
      enabledRef.current = false
      clearReconnectTimer()
      clearHandshakeTimeout()
      const ws = wsRef.current
      wsRef.current = null
      if (
        ws &&
        (ws.readyState === WS_READY_OPEN ||
          ws.readyState === WS_READY_CONNECTING)
      ) {
        markCloseCause(ws, 'hook-unmount-cleanup')
        ws.close()
      }
      setConnectionState('disconnected')
    }
  }, [clearReconnectTimer, clearHandshakeTimeout, markCloseCause])

  return {
    wsRef,
    connectionState,
    plannedReconnect,
    setPlannedReconnect,
    reconnect,
    close,
  }
}
