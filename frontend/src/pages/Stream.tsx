import Hls from 'hls.js'
import { ChevronLeft, Eye, MessageSquare, Radio, Send, Settings } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { StreamMessage } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    useEndStream,
    useGoLive,
    useSendStreamMessage,
    useStream,
    useStreamMessages,
} from '@/hooks/useStreams'
import { getCurrentUser } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'

const HlsPlayer = ({ streamUrl }: { streamUrl: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const hlsRef = useRef<Hls | null>(null)
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const retryCountRef = useRef(0)
    const tryConnectRef = useRef<(() => void) | null>(null)

    const [status, setStatus] = useState<'loading' | 'playing' | 'buffering' | 'error'>('loading')
    const [errorMessage, setErrorMessage] = useState('')

    const MAX_RETRIES = 10
    const RETRY_DELAY_MS = 3000

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        retryCountRef.current = 0
        setStatus('loading')
        setErrorMessage('')

        const createHlsConfig = () => ({
            enableWorker: true,
            lowLatencyMode: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            liveDurationInfinity: true,
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 2000,
            levelLoadingMaxRetry: 6,
            levelLoadingRetryDelay: 2000,
            fragLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
        })

        const tryConnect = () => {
            // Tear down previous instance
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }

            if (!Hls.isSupported()) {
                // Safari native HLS fallback
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl
                    video.addEventListener('loadedmetadata', () => {
                        setStatus('playing')
                        video.play().catch(() => setStatus('playing'))
                    })
                    video.addEventListener('error', () => {
                        setStatus('error')
                        setErrorMessage('Native playback failed. The stream may be offline.')
                    })
                } else {
                    setStatus('error')
                    setErrorMessage('Your browser does not support HLS playback.')
                }
                return
            }

            const hls = new Hls(createHlsConfig())
            hlsRef.current = hls

            hls.loadSource(streamUrl)
            hls.attachMedia(video)

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                retryCountRef.current = 0
                setStatus('playing')
                video.play().catch(() => {
                    setStatus('playing')
                })
            })

            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return

                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        if (retryCountRef.current < MAX_RETRIES) {
                            retryCountRef.current += 1
                            setStatus('loading')
                            setErrorMessage(
                                `Stream unreachable — retrying (${retryCountRef.current}/${MAX_RETRIES})…`
                            )
                            hls.destroy()
                            hlsRef.current = null
                            retryTimeoutRef.current = setTimeout(tryConnect, RETRY_DELAY_MS)
                        } else {
                            setStatus('error')
                            setErrorMessage(
                                'Cannot reach the stream. It may be offline or the URL is incorrect.'
                            )
                        }
                        break

                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError()
                        break

                    default:
                        setStatus('error')
                        setErrorMessage('A fatal playback error occurred. Try refreshing the page.')
                        hls.destroy()
                        hlsRef.current = null
                        break
                }
            })

            video.addEventListener('waiting', () => setStatus('buffering'))
            video.addEventListener('playing', () => setStatus('playing'))
        }

        tryConnectRef.current = tryConnect
        tryConnect()

        return () => {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [streamUrl])

    const handleRetry = () => {
        retryCountRef.current = 0
        setStatus('loading')
        setErrorMessage('')
        tryConnectRef.current?.()
    }

    const overlayVisible = status !== 'playing'

    return (
        <div className="relative w-full h-full bg-black">
            <video ref={videoRef} className="w-full h-full" controls autoPlay muted playsInline />

            {overlayVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none">
                    {status === 'loading' && (
                        <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
                            <p className="text-sm">{errorMessage || 'Connecting to stream…'}</p>
                        </div>
                    )}
                    {status === 'buffering' && (
                        <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
                            <p className="text-sm">Buffering…</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="text-center text-white pointer-events-auto">
                            <Radio className="w-12 h-12 mx-auto mb-3 text-red-400" />
                            <p className="text-sm mb-3">{errorMessage}</p>
                            <Button variant="secondary" size="sm" onClick={handleRetry}>
                                Retry
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function VideoPlayer({
    stream,
}: {
    stream: { stream_url: string; stream_type: string; title: string }
}) {
    const extractYouTubeId = (url: string): string => {
        // Handle various YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/, // Just the ID
        ]
        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match) return match[1]
        }
        return url // Return as-is if no pattern matches
    }

    switch (stream.stream_type) {
        case 'youtube': {
            const videoId = extractYouTubeId(stream.stream_url)
            return (
                <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                    title={stream.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                />
            )
        }
        case 'twitch': {
            const parent = window.location.hostname
            return (
                <iframe
                    className="w-full h-full"
                    src={`https://player.twitch.tv/?channel=${stream.stream_url}&parent=${parent}`}
                    title={stream.title}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                />
            )
        }
        case 'iframe':
            return (
                <iframe
                    className="w-full h-full"
                    src={stream.stream_url}
                    title={stream.title}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                />
            )
        case 'hls':
            return <HlsPlayer streamUrl={stream.stream_url} />
        default:
            return (
                <div className="w-full h-full flex items-center justify-center bg-black text-white">
                    <div className="text-center">
                        <Radio className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                        <p>Stream URL: {stream.stream_url}</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            Unsupported stream type: {stream.stream_type}
                        </p>
                    </div>
                </div>
            )
    }
}

function ChatMessage({ message }: { message: StreamMessage }) {
    return (
        <div className="flex gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors">
            <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={message.user?.avatar} />
                <AvatarFallback className="text-xs">
                    {message.user?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm text-primary mr-2">
                    {message.user?.username}
                </span>
                <span className="text-sm text-foreground wrap-break-word">{message.content}</span>
            </div>
        </div>
    )
}

function StreamChat({ streamId }: { streamId: number }) {
    const [message, setMessage] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)
    const { data: messages = [] } = useStreamMessages(streamId)
    const sendMessage = useSendStreamMessage()

    useEffect(() => {
        // Scroll to bottom when new messages arrive
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages.length])

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!message.trim()) return

        sendMessage.mutate({ streamId, content: message })
        setMessage('')
    }

    return (
        <div className="flex flex-col h-full bg-card border-l">
            {/* Chat Header */}
            <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    <span className="font-semibold">Stream Chat</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="w-4 h-4" />
                </Button>
            </div>

            {/* Messages */}
            <ScrollArea ref={scrollRef} className="flex-1">
                <div className="py-2">
                    {messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-8">
                            No messages yet. Say hi! 👋
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t">
                <div className="flex gap-2">
                    <Input
                        placeholder="Send a message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="flex-1"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!message.trim() || sendMessage.isPending}
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </div>
    )
}

export default function Stream() {
    const { id } = useParams<{ id: string }>()
    const streamId = Number(id)
    const { data: stream, isLoading, error } = useStream(streamId)
    const currentUser = getCurrentUser()
    const goLive = useGoLive()
    const endStream = useEndStream()

    const isOwner = stream?.user_id === currentUser?.id

    if (error) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-semibold mb-2">Stream not found</h2>
                    <p className="text-muted-foreground mb-4">
                        This stream doesn't exist or has been removed.
                    </p>
                    <Button asChild>
                        <Link to="/streams">Browse Streams</Link>
                    </Button>
                </div>
            </div>
        )
    }

    if (isLoading || !stream) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col lg:flex-row overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Video Player */}
                <div className="relative aspect-video bg-black w-full">
                    {stream.is_live ? (
                        <VideoPlayer stream={stream} />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center text-white">
                                <Radio className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <h3 className="text-xl font-semibold mb-2">Stream Offline</h3>
                                <p className="text-sm text-white/70">
                                    {isOwner
                                        ? 'Click "Go Live" to start streaming'
                                        : 'Check back later!'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Stream Info */}
                <div className="p-4 bg-card border-b">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-4 min-w-0">
                            <Avatar className="w-12 h-12 shrink-0">
                                <AvatarImage src={stream.user?.avatar} />
                                <AvatarFallback>
                                    {stream.user?.username?.[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <h1 className="text-lg font-bold truncate">{stream.title}</h1>
                                <p className="text-sm text-muted-foreground">
                                    {stream.user?.username}
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                    {stream.is_live && (
                                        <Badge className="bg-red-500 text-white border-0">
                                            <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse" />
                                            LIVE
                                        </Badge>
                                    )}
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        <Eye className="w-4 h-4" />
                                        {stream.viewer_count.toLocaleString()} viewers
                                    </div>
                                    {stream.category && (
                                        <Badge variant="secondary">{stream.category}</Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button variant="ghost" size="icon" asChild>
                                <Link to="/streams">
                                    <ChevronLeft className="w-5 h-5" />
                                </Link>
                            </Button>
                            {isOwner &&
                                (stream.is_live ? (
                                    <Button
                                        variant="destructive"
                                        onClick={() => endStream.mutate(stream.id)}
                                        disabled={endStream.isPending}
                                    >
                                        End Stream
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => goLive.mutate(stream.id)}
                                        disabled={goLive.isPending}
                                    >
                                        <Radio className="w-4 h-4 mr-2" />
                                        Go Live
                                    </Button>
                                ))}
                        </div>
                    </div>

                    {stream.description && (
                        <p className="mt-4 text-sm text-muted-foreground">{stream.description}</p>
                    )}
                </div>
            </div>

            {/* Chat Sidebar */}
            <div className={cn('w-full lg:w-80 xl:w-96 shrink-0', 'h-80 lg:h-full')}>
                <StreamChat streamId={streamId} />
            </div>
        </div>
    )
}
