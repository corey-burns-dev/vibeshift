import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Send, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getAuthToken, getCurrentUser } from '@/hooks'

type GameState = {
    board: string[][]
    status: 'pending' | 'active' | 'finished' | 'cancelled'
    winner_id: number | null
    next_turn: number
    is_draw: boolean
}

type ChatMessage = {
    user_id: number
    username: string
    text: string
}

export default function ConnectFour() {
    const { id } = useParams()
    const navigate = useNavigate()
    const currentUser = getCurrentUser()
    const token = getAuthToken()

    const [gameState, setGameState] = useState<GameState | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState('')
    const [hoverColumn, setHoverColumn] = useState<number | null>(null)

    const ws = useRef<WebSocket | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const shouldAutoJoinRef = useRef(false)
    const hasJoined = useRef(false)
    const [_, setConnectionError] = useState(false)
    const connectionErrorRef = useRef(false)

    const { data: room, isError } = useQuery({
        queryKey: ['gameRoom', id],
        queryFn: () => apiClient.getGameRoom(Number(id)),
        enabled: !!id,
    })

    useEffect(() => {
        if (isError) {
            toast.error('Game not found')
            navigate('/games')
        }
    }, [isError, navigate])

    useEffect(() => {
        if (!room?.current_state) return
        try {
            const board = JSON.parse(room.current_state)
            setGameState({
                board: Array.isArray(board)
                    ? board
                    : Array(6)
                          .fill(null)
                          .map(() => Array(7).fill('')),
                status: room.status as GameState['status'],
                winner_id: room.winner_id ?? null,
                next_turn: room.next_turn_id,
                is_draw: room.is_draw,
            })
        } catch (e) {
            console.error('Failed to parse board state', e)
        }
    }, [room])

    useEffect(() => {
        if (
            room &&
            currentUser &&
            room.status === 'pending' &&
            room.creator_id !== currentUser.id &&
            !hasJoined.current
        ) {
            shouldAutoJoinRef.current = true
            // If socket is already open, join immediately
            if (ws.current?.readyState === WebSocket.OPEN) {
                hasJoined.current = true
                ws.current.send(
                    JSON.stringify({
                        type: 'join_room',
                        room_id: Number(id),
                    })
                )
                shouldAutoJoinRef.current = false
            }
        }
    }, [room, currentUser, id])

    useEffect(() => {
        if (!id || !token) return
        setConnectionError(false)
        connectionErrorRef.current = false
        hasJoined.current = false

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        const wsUrl = `${protocol}//${host}/api/ws/game?room_id=${id}&token=${token}`

        try {
            ws.current = new WebSocket(wsUrl)
        } catch (e) {
            console.error('Failed to create WebSocket:', e)
            setConnectionError(true)
            connectionErrorRef.current = true
            return
        }

        ws.current.onopen = () => {
            setConnectionError(false)
            connectionErrorRef.current = false
            if (shouldAutoJoinRef.current && !hasJoined.current) {
                hasJoined.current = true
                ws.current?.send(
                    JSON.stringify({
                        type: 'join_room',
                        room_id: Number(id),
                    })
                )
                shouldAutoJoinRef.current = false
            }
        }

        ws.current.onmessage = (event) => {
            try {
                const action = JSON.parse(event.data)
                switch (action.type) {
                    case 'game_state':
                        setGameState(action.payload)
                        break
                    case 'game_started':
                        setGameState((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      status: action.payload.status,
                                      next_turn: action.payload.next_turn,
                                  }
                                : null
                        )
                        toast.success('Connect 4 Started!', {
                            description: 'Your opponent has joined.',
                        })
                        break
                    case 'chat':
                        setMessages((prev) => [
                            ...prev,
                            {
                                user_id: action.user_id,
                                username: action.payload.username || 'Opponent',
                                text: action.payload.text,
                            },
                        ])
                        break
                    case 'error':
                        toast.error('Game Error', {
                            description: action.payload.message,
                        })
                        break
                }
            } catch (e) {
                console.error('Failed to parse message:', e)
            }
        }

        ws.current.onerror = () => {
            if (!connectionErrorRef.current) {
                setConnectionError(true)
                connectionErrorRef.current = true
            }
        }

        ws.current.onclose = () => {
            // Connection closed
        }

        return () => ws.current?.close()
    }, [id, token])

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when new messages arrive
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length])

    const makeMove = (col: number) => {
        if (!gameState || gameState.status !== 'active' || gameState.next_turn !== currentUser?.id)
            return
        if (gameState.board[0][col] !== '') return

        ws.current?.send(
            JSON.stringify({
                type: 'make_move',
                room_id: Number(id),
                payload: { column: col },
            })
        )
    }

    const joinGame = () => {
        ws.current?.send(
            JSON.stringify({
                type: 'join_room',
                room_id: Number(id),
            })
        )
    }

    const sendChat = () => {
        if (!chatInput.trim()) return
        ws.current?.send(
            JSON.stringify({
                type: 'chat',
                room_id: Number(id),
                payload: { text: chatInput.trim(), username: currentUser?.username },
            })
        )
        setChatInput('')
    }

    if (!room || !gameState) return <div className="p-8 text-center">Loading game...</div>

    const isCreator = currentUser?.id === room.creator_id
    const isOpponent = currentUser?.id === room.opponent_id
    const isPlayer = isCreator || isOpponent
    const canJoin = !isPlayer && room.status === 'pending'
    const isMyTurn = gameState.status === 'active' && gameState.next_turn === currentUser?.id

    const getStatusText = () => {
        if (gameState.status === 'pending') return 'Waiting for opponent...'
        if (gameState.status === 'finished') {
            if (gameState.is_draw) return 'Game Draw!'
            return gameState.winner_id === currentUser?.id ? '🎉 You Won!' : '💀 You Lost!'
        }
        return isMyTurn ? '👉 Your Turn' : '⌛ Processing...'
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-4 gap-8">
                {/* Game Area */}
                <div className="lg:col-span-3 space-y-6">
                    <Card className="border-2 shadow-xl bg-blue-900/10 border-blue-500/20">
                        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-blue-500/10 bg-blue-500/5">
                            <div>
                                <CardTitle className="text-3xl font-black flex items-center gap-3 text-blue-500 italic uppercase">
                                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg">
                                        4
                                    </div>
                                    Connect Four
                                </CardTitle>
                                <p className="text-xs text-muted-foreground font-bold tracking-widest mt-1 opacity-60">
                                    MATCH ID: #{id}
                                </p>
                            </div>
                            <div
                                className={`px-6 py-2 rounded-xl font-black text-xs uppercase tracking-tighter ${
                                    isMyTurn
                                        ? 'bg-blue-500 text-white animate-pulse'
                                        : 'bg-muted text-muted-foreground'
                                }`}
                            >
                                {getStatusText()}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-10 pb-12 flex flex-col items-center overflow-hidden">
                            {/* Column Selection indicators */}
                            <div className="grid grid-cols-7 gap-3 mb-2 w-full max-w-150 px-4">
                                {[...Array(7)].map((_, i) => {
                                    const colId = `indicator-${i}`
                                    return (
                                        <div key={colId} className="flex justify-center h-8">
                                            {hoverColumn === i &&
                                                isMyTurn &&
                                                gameState.status === 'active' && (
                                                    <ChevronDown className="text-blue-500 animate-bounce" />
                                                )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* The Board */}
                            <div className="relative p-4 bg-blue-600 rounded-3xl shadow-[0_20px_50px_rgba(37,99,235,0.3)] border-8 border-blue-700">
                                <div className="grid grid-cols-7 gap-3 bg-blue-800 p-2 rounded-2xl shadow-inner">
                                    {gameState.board.map((row, r) =>
                                        row.map((cell, c) => {
                                            const cellId = `c4-cell-${r}-${c}`
                                            return (
                                                <button
                                                    type="button"
                                                    key={cellId}
                                                    onMouseEnter={() => setHoverColumn(c)}
                                                    onMouseLeave={() => setHoverColumn(null)}
                                                    onClick={() => makeMove(c)}
                                                    disabled={
                                                        gameState.status !== 'active' ||
                                                        !isMyTurn ||
                                                        gameState.board[0][c] !== ''
                                                    }
                                                    className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 relative overflow-hidden
                                                        ${cell === '' ? 'bg-blue-950/50 shadow-inner' : ''}
                                                        ${gameState.status === 'active' && isMyTurn && gameState.board[0][c] === '' ? 'cursor-pointer hover:bg-blue-900/50' : 'cursor-default'}
                                                    `}
                                                >
                                                    {cell === 'X' && (
                                                        <div className="w-4/5 h-4/5 rounded-full bg-linear-to-br from-red-400 to-red-600 shadow-lg border-4 border-red-700 animate-in fade-in zoom-in duration-300 slide-in-from-top-12" />
                                                    )}
                                                    {cell === 'O' && (
                                                        <div className="w-4/5 h-4/5 rounded-full bg-linear-to-br from-yellow-300 to-yellow-500 shadow-lg border-4 border-yellow-600 animate-in fade-in zoom-in duration-300 slide-in-from-top-12" />
                                                    )}

                                                    {/* Hole lighting effect */}
                                                    <div className="absolute inset-0 pointer-events-none rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] opacity-50" />
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            {canJoin && (
                                <div className="mt-12 flex flex-col items-center gap-4">
                                    <p className="text-muted-foreground font-medium">
                                        Room waiting for a challenger...
                                    </p>
                                    <Button
                                        size="lg"
                                        className="px-20 text-xl py-8 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                                        onClick={joinGame}
                                    >
                                        Join Match
                                    </Button>
                                </div>
                            )}

                            {gameState.status === 'finished' && (
                                <div className="mt-10 flex flex-col items-center">
                                    <div className="text-center mb-6">
                                        <h3 className="text-2xl font-black italic uppercase text-blue-500 mb-1">
                                            Game Over
                                        </h3>
                                        <p className="text-muted-foreground font-bold">
                                            Hope you had a great vibe!
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="px-10 border-blue-500/20 hover:bg-blue-500/5"
                                        onClick={() => navigate('/games')}
                                    >
                                        Return to Lobby
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 rounded-2xl border-2 bg-card/50 border-red-500/10 hover:border-red-500/20 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center font-black text-white shadow-lg shadow-red-500/20">
                                    X
                                </div>
                                <div>
                                    <p className="text-[10px] text-red-500 font-black uppercase tracking-[0.2em] mb-1">
                                        Player 1 (Creator)
                                    </p>
                                    <p className="font-black text-lg">{room.creator.username}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl border-2 bg-card/50 border-yellow-500/10 hover:border-yellow-500/20 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-yellow-400 flex items-center justify-center font-black text-white shadow-lg shadow-yellow-400/20">
                                    O
                                </div>
                                <div>
                                    <p className="text-[10px] text-yellow-500 font-black uppercase tracking-[0.2em] mb-1">
                                        Player 2 (Challenger)
                                    </p>
                                    <p className="font-black text-lg">
                                        {room.opponent?.username ||
                                            (gameState.status === 'pending' ? 'WAITING...' : 'BOT')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar: Chat & Stats */}
                <div className="space-y-6">
                    <Card className="h-150 flex flex-col border-2 overflow-hidden bg-card/50 backdrop-blur-sm">
                        <div className="p-4 bg-blue-500/5 border-b font-black text-xs uppercase tracking-widest flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            Game Feed
                        </div>
                        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 filter grayscale">
                                    <Send className="w-12 h-12 mb-2" />
                                    <p className="text-xs font-bold uppercase tracking-tighter">
                                        No messages yet
                                    </p>
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div
                                    key={`${m.user_id}-${i}-${m.text.slice(0, 20)}`}
                                    className={`flex flex-col ${m.user_id === currentUser?.id ? 'items-end' : 'items-start'}`}
                                >
                                    <span className="text-[9px] uppercase font-black text-muted-foreground/60 mb-1 tracking-tighter">
                                        {m.username}
                                    </span>
                                    <div
                                        className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] font-medium shadow-sm transition-all hover:scale-[1.02] ${
                                            m.user_id === currentUser?.id
                                                ? 'bg-blue-600 text-white rounded-tr-none'
                                                : 'bg-muted rounded-tl-none border'
                                        }`}
                                    >
                                        {m.text}
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </CardContent>
                        <div className="p-4 border-t bg-background/80 backdrop-blur-md">
                            <div className="flex gap-2">
                                <Input
                                    className="bg-card/50 border-blue-500/10 focus-visible:ring-blue-500/30"
                                    placeholder="Talk some trash..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                                />
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/10"
                                    size="icon"
                                    onClick={sendChat}
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="bg-linear-to-br from-blue-900 to-indigo-900 border-2 border-blue-400/20 rounded-3xl p-8 text-center text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-700" />
                        <Trophy className="w-14 h-14 text-yellow-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.4)]" />
                        <h4 className="font-black italic text-xl uppercase tracking-tighter mb-2">
                            Victory Prize
                        </h4>
                        <div className="bg-white/10 rounded-2xl py-3 px-4 backdrop-blur-md border border-white/10 mb-6">
                            <p className="text-3xl font-black text-yellow-400">+15</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                                VibePoints
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full text-[10px] font-black uppercase tracking-widest border-white/20 hover:bg-white/10 text-white h-10 rounded-xl"
                            onClick={() => {
                                toast.success('LINK SECURED', {
                                    description: 'Invite link copied to clipboard!',
                                })
                            }}
                        >
                            Copy Invite
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
