// WebRTC video chat hook — manages camera/mic, peer connections, and signaling via WebSocket

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { createTicketedWS, getNextBackoff } from '@/lib/ws-utils'

interface PeerInfo {
  // ...
  userId: number
  username: string
}

interface RemoteStream {
  userId: number
  username: string
  stream: MediaStream
}

interface VideoChatSignal {
  type: string
  room_id?: string
  user_id?: number
  target_id?: number
  username?: string
  // biome-ignore lint/suspicious/noExplicitAny: signaling payload varies (SDP, ICE)
  payload?: any
}

// Build ICE server config — includes TURN when env vars are set
function buildIceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined
  const turnPass = import.meta.env.VITE_TURN_PASSWORD as string | undefined

  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser ?? '',
      credential: turnPass ?? '',
    })
  }

  return { iceServers: servers }
}

const MAX_RECONNECT_ATTEMPTS = 5
const _RECONNECT_BASE_DELAY_MS = 1000

interface UseVideoChatOptions {
  roomId: string
  enabled?: boolean
}

export function useVideoChat({ roomId, enabled = true }: UseVideoChatOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<PeerInfo[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const reconnectAttemptsRef = useRef(0)
  const intentionalDisconnectRef = useRef(false)
  const iceConfig = useRef(buildIceConfig())

  // Remove a remote stream and close peer connection
  const removePeer = useCallback((userId: number) => {
    const pc = peerConnectionsRef.current.get(userId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(userId)
    }
    setRemoteStreams(prev => prev.filter(s => s.userId !== userId))
    setPeers(prev => prev.filter(p => p.userId !== userId))
  }, [])

  // Create a peer connection for a remote user
  const createPeerConnection = useCallback(
    (userId: number, username: string): RTCPeerConnection => {
      // Clean up existing connection if any
      const existing = peerConnectionsRef.current.get(userId)
      if (existing) {
        existing.close()
      }

      const pc = new RTCPeerConnection(iceConfig.current)
      peerConnectionsRef.current.set(userId, pc)

      // Add local tracks to the connection
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current)
        }
      }

      // When we receive remote tracks
      pc.ontrack = event => {
        const [remoteStream] = event.streams
        if (remoteStream) {
          setRemoteStreams(prev => {
            const filtered = prev.filter(s => s.userId !== userId)
            return [...filtered, { userId, username, stream: remoteStream }]
          })
        }
      }

      // Send ICE candidates to the remote peer via signaling
      pc.onicecandidate = event => {
        const ws = wsRef.current
        if (event.candidate && ws?.readyState === WebSocket.OPEN) {
          const signal: VideoChatSignal = {
            type: 'ice-candidate',
            target_id: userId,
            payload: event.candidate.toJSON(),
          }
          ws.send(JSON.stringify(signal))
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'disconnected'
        ) {
          removePeer(userId)
        }
      }

      return pc
    },
    [removePeer]
  )

  // Initiate a call to a remote peer (create offer)
  const callPeer = useCallback(
    async (userId: number, username: string) => {
      const pc = createPeerConnection(userId, username)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          const signal: VideoChatSignal = {
            type: 'offer',
            target_id: userId,
            payload: pc.localDescription,
          }
          ws.send(JSON.stringify(signal))
        }
      } catch (err) {
        console.error('Failed to create offer for peer', userId, err)
      }
    },
    [createPeerConnection]
  )

  // Handle incoming signaling messages
  const handleSignal = useCallback(
    async (signal: VideoChatSignal) => {
      switch (signal.type) {
        case 'room_users': {
          // We just joined — call each existing user
          // biome-ignore lint/suspicious/noExplicitAny: server payload uses snake_case keys
          const users = signal.payload?.users as any[] | undefined
          if (users) {
            const peerList = users.map(u => ({
              userId: (u.userId ?? u.user_id) as number,
              username: u.username as string,
            }))
            setPeers(peerList)
            for (const peer of peerList) {
              await callPeer(peer.userId, peer.username)
            }
          }
          break
        }

        case 'user_joined': {
          const userId = signal.user_id
          const username = signal.username ?? 'Unknown'
          if (userId) {
            setPeers(prev => {
              if (prev.some(p => p.userId === userId)) return prev
              return [...prev, { userId, username }]
            })
          }
          // Don't call them — they will call us (they received room_users)
          break
        }

        case 'user_left':
          if (signal.user_id) {
            removePeer(signal.user_id)
          }
          break

        case 'offer': {
          const fromId = signal.user_id
          const fromName = signal.username ?? 'Unknown'
          if (!fromId) break

          const pc = createPeerConnection(fromId, fromName)
          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload)
            )
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              const resp: VideoChatSignal = {
                type: 'answer',
                target_id: fromId,
                payload: pc.localDescription,
              }
              ws.send(JSON.stringify(resp))
            }
          } catch (err) {
            console.error('Failed to handle offer from', fromId, err)
          }
          break
        }

        case 'answer': {
          const fromId = signal.user_id
          if (!fromId) break
          const pc = peerConnectionsRef.current.get(fromId)
          if (pc) {
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription(signal.payload)
              )
            } catch (err) {
              console.error(
                'Failed to set remote description from',
                fromId,
                err
              )
            }
          }
          break
        }

        case 'ice-candidate': {
          const fromId = signal.user_id
          if (!fromId) break
          const pc = peerConnectionsRef.current.get(fromId)
          if (pc && signal.payload) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.payload))
            } catch (err) {
              console.error('Failed to add ICE candidate from', fromId, err)
            }
          }
          break
        }

        case 'error':
          setError(signal.payload?.message ?? 'Unknown error')
          break
      }
    },
    [callPeer, createPeerConnection, removePeer]
  )

  // Connect WebSocket and acquire media
  const connect = useCallback(async () => {
    if (!enabled || !roomId) return
    intentionalDisconnectRef.current = false

    // Pre-check camera/mic permission before prompting
    try {
      const cameraPermission = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      })
      if (cameraPermission.state === 'denied') {
        setError(
          'Camera permission is denied. Please allow camera access in your browser settings.'
        )
        return
      }
    } catch {
      // permissions.query may not be supported for camera — proceed anyway
    }

    // Acquire camera + mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      localStreamRef.current = stream
      setLocalStream(stream)
    } catch (err) {
      console.error('Failed to get media devices:', err)
      setError('Could not access camera/microphone. Please check permissions.')
      return
    }

    // Open signaling WebSocket
    try {
      const ws = await createTicketedWS({
        path: `/api/ws/videochat?room=${encodeURIComponent(roomId)}`,
        onOpen: () => {
          setIsConnected(true)
          setError(null)
          reconnectAttemptsRef.current = 0
        },
        onMessage: event => {
          try {
            const signal = JSON.parse(event.data) as VideoChatSignal
            handleSignal(signal)
          } catch (err) {
            console.error('Failed to parse signaling message:', err)
          }
        },
        onClose: () => {
          setIsConnected(false)

          // Auto-reconnect with exponential backoff (unless intentional disconnect)
          if (
            !intentionalDisconnectRef.current &&
            reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
          ) {
            const delay = getNextBackoff(reconnectAttemptsRef.current++)
            reconnectTimeoutRef.current = setTimeout(() => {
              connect()
            }, delay)
          }
        },
        onError: () => {
          setError('WebSocket connection failed')
          setIsConnected(false)
        },
      })
      wsRef.current = ws
    } catch (err) {
      if (intentionalDisconnectRef.current) return

      if (err instanceof ApiError && err.status === 401) {
        setError('Not authenticated')
        return
      }

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = getNextBackoff(reconnectAttemptsRef.current++)
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      } else {
        setError('Failed to connect to signaling server')
      }
    }
  }, [enabled, roomId, handleSignal])

  // Disconnect everything
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }
    reconnectAttemptsRef.current = 0

    // Close all peer connections
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close()
    }
    peerConnectionsRef.current.clear()

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Stop all local tracks
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop()
      }
      localStreamRef.current = null
    }

    setLocalStream(null)
    setRemoteStreams([])
    setPeers([])
    setIsConnected(false)
    setError(null)
  }, [])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      for (const track of audioTracks) {
        track.enabled = !track.enabled
      }
      setIsMuted(prev => !prev)
    }
  }, [])

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks()
      for (const track of videoTracks) {
        track.enabled = !track.enabled
      }
      setIsVideoOff(prev => !prev)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      disconnect()
    }
  }, [disconnect])

  return {
    localStream,
    remoteStreams,
    isConnected,
    isMuted,
    isVideoOff,
    error,
    peers,
    connect,
    disconnect,
    toggleMute,
    toggleVideo,
  }
}
