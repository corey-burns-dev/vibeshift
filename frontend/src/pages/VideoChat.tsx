import {
  Camera,
  CameraOff,
  ChevronLeft,
  Copy,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCurrentUser } from '@/hooks/useUsers'
import { useVideoChat } from '@/hooks/useVideoChat'
import { cn } from '@/lib/utils'

// Small reusable component to render a <video> element bound to a MediaStream
function VideoTile({
  stream,
  muted = false,
  label,
  isLocal = false,
  isVideoOff = false,
}: {
  stream: MediaStream | null
  muted?: boolean
  label: string
  isLocal?: boolean
  isVideoOff?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className='relative aspect-video bg-muted rounded-xl overflow-hidden border border-border shadow-md'>
      {isVideoOff ? (
        <div className='absolute inset-0 flex items-center justify-center bg-muted'>
          <div className='flex flex-col items-center gap-2'>
            <CameraOff className='h-10 w-10 text-muted-foreground' />
            <span className='text-sm text-muted-foreground'>{label}</span>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={cn(
            'w-full h-full object-cover',
            isLocal && 'scale-x-[-1]'
          )}
        />
      )}
      <div className='absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md'>
        {label}
        {isLocal && ' (You)'}
      </div>
    </div>
  )
}

// Lobby — lets user create or join a room before entering the call
function Lobby({ onJoin }: { onJoin: (roomId: string) => void }) {
  const [roomInput, setRoomInput] = useState('')
  const [generatedRoom, setGeneratedRoom] = useState('')

  const generateRoomId = useCallback(() => {
    const id = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    setGeneratedRoom(id)
    return id
  }, [])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  return (
    <div className='flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-4'>
      <div className='w-full max-w-md space-y-8'>
        <div className='text-center space-y-2'>
          <div className='flex items-center justify-center gap-3 mb-2'>
            <Video className='h-8 w-8 text-primary' />
            <h1 className='text-3xl font-bold tracking-tight'>Video Chat</h1>
          </div>
          <p className='text-muted-foreground'>
            Start a video call with friends — peer-to-peer, no servers in the
            middle.
          </p>
        </div>

        {/* Create new room */}
        <div className='bg-card border border-border rounded-xl p-6 space-y-4'>
          <h2 className='text-lg font-semibold flex items-center gap-2'>
            <MonitorUp className='h-5 w-5' />
            Create a Room
          </h2>
          {generatedRoom ? (
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                <Input
                  value={generatedRoom}
                  readOnly
                  className='font-mono text-sm'
                />
                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => copyToClipboard(generatedRoom)}
                  title='Copy room ID'
                >
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Share this room ID with others so they can join.
              </p>
              <Button className='w-full' onClick={() => onJoin(generatedRoom)}>
                <Phone className='h-4 w-4 mr-2' />
                Join Room
              </Button>
            </div>
          ) : (
            <Button
              className='w-full'
              variant='outline'
              onClick={generateRoomId}
            >
              Generate Room ID
            </Button>
          )}
        </div>

        {/* Join existing room */}
        <div className='bg-card border border-border rounded-xl p-6 space-y-4'>
          <h2 className='text-lg font-semibold flex items-center gap-2'>
            <Phone className='h-5 w-5' />
            Join a Room
          </h2>
          <div className='flex items-center gap-2'>
            <Input
              placeholder='Enter room ID...'
              value={roomInput}
              onChange={e => setRoomInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && roomInput.trim()) {
                  onJoin(roomInput.trim())
                }
              }}
              className='font-mono text-sm'
            />
            <Button
              disabled={!roomInput.trim()}
              onClick={() => onJoin(roomInput.trim())}
            >
              Join
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Active call view — shows video grid and controls
function ActiveCall({
  roomId,
  onLeave,
}: {
  roomId: string
  onLeave: () => void
}) {
  const currentUser = getCurrentUser()
  const {
    localStream,
    remoteStreams,
    isConnected,
    isMuted,
    isVideoOff,
    error,
    connect,
    disconnect,
    toggleMute,
    toggleVideo,
  } = useVideoChat({ roomId, enabled: true })

  // Auto-connect on mount
  useEffect(() => {
    connect()
  }, [connect])

  const handleLeave = useCallback(() => {
    disconnect()
    onLeave()
  }, [disconnect, onLeave])

  const totalStreams = 1 + remoteStreams.length // local + remotes
  const gridCols =
    totalStreams <= 1
      ? 'grid-cols-1 max-w-2xl mx-auto'
      : totalStreams <= 4
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-2 md:grid-cols-3'

  return (
    <div className='flex flex-col h-[calc(100vh-8rem)]'>
      {/* Header */}
      <div className='flex items-center justify-between px-4 py-3 border-b border-border bg-card/50'>
        <div className='flex items-center gap-3'>
          <Button variant='ghost' size='icon' asChild>
            <Link to='/videochat'>
              <ChevronLeft className='h-5 w-5' />
            </Link>
          </Button>
          <div>
            <h2 className='text-sm font-semibold'>Video Chat</h2>
            <p className='text-xs text-muted-foreground font-mono'>{roomId}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
            )}
          />
          <span className='text-xs text-muted-foreground'>
            {isConnected ? `${totalStreams} in call` : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className='bg-destructive/10 text-destructive text-sm px-4 py-2 text-center'>
          {error}
        </div>
      )}

      {/* Video grid */}
      <div className='flex-1 overflow-auto p-4'>
        <div className={cn('grid gap-4', gridCols)}>
          {/* Local video */}
          <VideoTile
            stream={localStream}
            muted
            label={currentUser?.username ?? 'You'}
            isLocal
            isVideoOff={isVideoOff}
          />

          {/* Remote videos */}
          {remoteStreams.map(remote => (
            <VideoTile
              key={remote.userId}
              stream={remote.stream}
              label={remote.username}
            />
          ))}
        </div>

        {/* Waiting message when alone */}
        {remoteStreams.length === 0 && isConnected && (
          <div className='text-center mt-8 text-muted-foreground'>
            <p className='text-sm'>Waiting for others to join...</p>
            <p className='text-xs mt-1 font-mono'>
              Share room ID: <strong>{roomId}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className='flex items-center justify-center gap-3 px-4 py-4 border-t border-border bg-card/50'>
        <Button
          variant={isMuted ? 'destructive' : 'outline'}
          size='icon'
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          className='rounded-full h-12 w-12'
        >
          {isMuted ? (
            <MicOff className='h-5 w-5' />
          ) : (
            <Mic className='h-5 w-5' />
          )}
        </Button>

        <Button
          variant={isVideoOff ? 'destructive' : 'outline'}
          size='icon'
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          className='rounded-full h-12 w-12'
        >
          {isVideoOff ? (
            <CameraOff className='h-5 w-5' />
          ) : (
            <Camera className='h-5 w-5' />
          )}
        </Button>

        <Button
          variant='destructive'
          size='icon'
          onClick={handleLeave}
          title='Leave call'
          className='rounded-full h-12 w-12'
        >
          <LogOut className='h-5 w-5' />
        </Button>
      </div>
    </div>
  )
}

// Main page — switches between lobby and active call
export function VideoChat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeRoom = searchParams.get('room')

  const handleJoin = useCallback(
    (roomId: string) => {
      setSearchParams({ room: roomId })
    },
    [setSearchParams]
  )

  const handleLeave = useCallback(() => {
    navigate('/videochat')
  }, [navigate])

  if (activeRoom) {
    return <ActiveCall roomId={activeRoom} onLeave={handleLeave} />
  }

  return <Lobby onJoin={handleJoin} />
}

export default VideoChat
