import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, PartyPopper, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getAuthToken, getCurrentUser } from '@/hooks'
import { useGameRoomSession } from '@/hooks/useGameRoomSession'
import { getAvatarUrl } from '@/lib/chat-utils'

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

type ActiveGameRoom = {
  id: number
  type: string
  status: string
  creator_id: number
  opponent_id?: number | null
}

const CONFETTI_COLORS = [
  '#facc15',
  '#fb7185',
  '#38bdf8',
  '#34d399',
  '#c084fc',
  '#f97316',
]
const VICTORY_BLAST_DURATION_MS = 4200
const DEFEAT_COLORS = [
  '#64748b',
  '#334155',
  '#0f172a',
  '#1e293b',
  '#475569',
  '#111827',
]
const CONFETTI_PIECES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  left: (index * 13) % 100,
  delay: (index % 7) * 0.14,
  duration: 2.4 + (index % 5) * 0.25,
  rotate: (index * 37) % 360,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
}))
const DEFEAT_PIECES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  left: (index * 11) % 100,
  delay: (index % 8) * 0.12,
  duration: 2.3 + (index % 6) * 0.2,
  rotate: (index * 17) % 360,
  color: DEFEAT_COLORS[index % DEFEAT_COLORS.length],
}))

export default function ConnectFour() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const token = getAuthToken()
  const queryClient = useQueryClient()

  const [gameState, setGameState] = useState<GameState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [hoverColumn, setHoverColumn] = useState<number | null>(null)
  const [showVictoryBlast, setShowVictoryBlast] = useState(false)
  const [showDefeatBlast, setShowDefeatBlast] = useState(false)
  const [showRematchDialog, setShowRematchDialog] = useState(false)
  const [isStartingRematch, setIsStartingRematch] = useState(false)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const didShowEndGameUiRef = useRef(false)
  const victoryTimeoutRef = useRef<number | null>(null)
  const defeatTimeoutRef = useRef<number | null>(null)
  const rematchDialogTimeoutRef = useRef<number | null>(null)
  const didShowGameStartedToastRef = useRef(false)

  const { data: room, isError } = useQuery({
    queryKey: ['gameRoom', id],
    queryFn: () => apiClient.getGameRoom(Number(id)),
    enabled: !!id,
  })

  const playVictoryJingle = useCallback(() => {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return

    const audioContext = new AudioContextClass()
    const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51]
    const startAt = audioContext.currentTime + 0.03

    melody.forEach((freq, index) => {
      const noteStart = startAt + index * 0.12
      const noteEnd = noteStart + 0.2

      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, noteStart)

      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)

      osc.connect(gain)
      gain.connect(audioContext.destination)

      osc.start(noteStart)
      osc.stop(noteEnd)
    })

    window.setTimeout(() => {
      void audioContext.close()
    }, 1400)
  }, [])

  const triggerVictoryBlast = useCallback(() => {
    setShowVictoryBlast(true)
    playVictoryJingle()

    if (victoryTimeoutRef.current !== null) {
      window.clearTimeout(victoryTimeoutRef.current)
    }

    victoryTimeoutRef.current = window.setTimeout(() => {
      setShowVictoryBlast(false)
    }, VICTORY_BLAST_DURATION_MS)
  }, [playVictoryJingle])

  const triggerDefeatBlast = useCallback(() => {
    setShowDefeatBlast(true)

    if (defeatTimeoutRef.current !== null) {
      window.clearTimeout(defeatTimeoutRef.current)
    }

    defeatTimeoutRef.current = window.setTimeout(() => {
      setShowDefeatBlast(false)
    }, VICTORY_BLAST_DURATION_MS)
  }, [])

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

  const roomId = id ? Number(id) : null

  useEffect(() => {
    if (!roomId || Number.isNaN(roomId)) {
      didShowGameStartedToastRef.current = false
      return
    }
    didShowGameStartedToastRef.current = false
  }, [roomId])

  const handleGameSocketAction = useCallback(
    (action: Record<string, unknown>) => {
      const actionType = typeof action.type === 'string' ? action.type : ''
      const payload =
        action.payload && typeof action.payload === 'object'
          ? (action.payload as Record<string, unknown>)
          : {}

      switch (actionType) {
        case 'game_state':
          setGameState(payload as unknown as GameState)
          break
        case 'game_started':
          setGameState(prev =>
            prev
              ? {
                  ...prev,
                  status:
                    typeof payload.status === 'string'
                      ? (payload.status as GameState['status'])
                      : prev.status,
                  next_turn:
                    typeof payload.next_turn === 'number'
                      ? payload.next_turn
                      : prev.next_turn,
                }
              : null
          )
          void queryClient.invalidateQueries({ queryKey: ['gameRoom', id] })
          if (!didShowGameStartedToastRef.current) {
            didShowGameStartedToastRef.current = true
            toast.success('Connect 4 Started!', {
              description: 'Your opponent has joined.',
            })
          }
          break
        case 'chat': {
          const userId = typeof action.user_id === 'number' ? action.user_id : 0
          const username =
            typeof payload.username === 'string' ? payload.username : 'Opponent'
          const text = typeof payload.text === 'string' ? payload.text : ''
          if (!text) return
          setMessages(prev => [
            ...prev,
            {
              user_id: userId,
              username,
              text,
            },
          ])
          break
        }
        case 'error': {
          const message =
            typeof payload.message === 'string'
              ? payload.message
              : 'Unknown error'
          toast.error('Game Error', {
            description:
              message === 'You are the creator'
                ? 'Open the room from a different account to join as opponent.'
                : message,
          })
          break
        }
      }
    },
    [id, queryClient]
  )

  const gameSession = useGameRoomSession({
    roomId: roomId && !Number.isNaN(roomId) ? roomId : null,
    token,
    room: room
      ? {
          creator_id: room.creator_id,
          opponent_id: room.opponent_id,
          status: room.status,
        }
      : null,
    currentUserId: currentUser?.id,
    onAction: handleGameSocketAction,
  })
  const isSocketReady = gameSession.isSocketReady

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when new messages arrive
  useEffect(() => {
    const chatContainer = chatScrollRef.current
    if (!chatContainer) return
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length])

  useEffect(() => {
    if (!gameState) return

    if (gameState.status === 'finished' && !didShowEndGameUiRef.current) {
      didShowEndGameUiRef.current = true

      if (!gameState.is_draw && gameState.winner_id === currentUser?.id) {
        triggerVictoryBlast()
        if (rematchDialogTimeoutRef.current !== null) {
          window.clearTimeout(rematchDialogTimeoutRef.current)
        }
        rematchDialogTimeoutRef.current = window.setTimeout(() => {
          setShowRematchDialog(true)
        }, VICTORY_BLAST_DURATION_MS)
      } else if (!gameState.is_draw) {
        triggerDefeatBlast()
        if (rematchDialogTimeoutRef.current !== null) {
          window.clearTimeout(rematchDialogTimeoutRef.current)
        }
        rematchDialogTimeoutRef.current = window.setTimeout(() => {
          setShowRematchDialog(true)
        }, VICTORY_BLAST_DURATION_MS)
      } else {
        setShowRematchDialog(true)
      }
      return
    }

    if (gameState.status === 'active' || gameState.status === 'pending') {
      didShowEndGameUiRef.current = false
    }
  }, [gameState, currentUser?.id, triggerVictoryBlast, triggerDefeatBlast])

  useEffect(() => {
    return () => {
      if (victoryTimeoutRef.current !== null) {
        window.clearTimeout(victoryTimeoutRef.current)
      }
      if (defeatTimeoutRef.current !== null) {
        window.clearTimeout(defeatTimeoutRef.current)
      }
      if (rematchDialogTimeoutRef.current !== null) {
        window.clearTimeout(rematchDialogTimeoutRef.current)
      }
    }
  }, [])

  const makeMove = (col: number) => {
    if (
      !gameState ||
      gameState.status !== 'active' ||
      gameState.next_turn !== currentUser?.id
    )
      return
    if (gameState.board[0][col] !== '') return

    gameSession.sendAction({
      type: 'make_move',
      payload: { column: col },
    })
  }

  const joinGame = () => {
    gameSession.joinRoom()
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    const sent = gameSession.sendAction({
      type: 'chat',
      payload: { text: chatInput.trim(), username: currentUser?.username },
    })
    if (!sent) return
    setChatInput('')
  }

  const handlePlayAgain = async () => {
    if (!currentUser) return

    setIsStartingRematch(true)
    try {
      const freshRooms = (await apiClient.getActiveGameRooms(
        'connect4'
      )) as ActiveGameRoom[]

      const joinableRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id !== currentUser.id &&
          !activeRoom.opponent_id
      )

      if (joinableRoom) {
        setShowRematchDialog(false)
        navigate(`/games/connect4/${joinableRoom.id}`)
        return
      }

      const myPendingRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id === currentUser.id
      )
      if (myPendingRoom) {
        setShowRematchDialog(false)
        navigate(`/games/connect4/${myPendingRoom.id}`)
        return
      }

      const newRoom = await apiClient.createGameRoom('connect4')
      setShowRematchDialog(false)
      navigate(`/games/connect4/${newRoom.id}`)
    } catch (error) {
      console.error('Failed to start rematch', error)
      toast.error('Could not start rematch. Please try again.')
    } finally {
      setIsStartingRematch(false)
    }
  }

  if (!room || !gameState)
    return <div className='p-8 text-center'>Loading game...</div>

  const isCreator = currentUser?.id === room.creator_id
  const isOpponent = currentUser?.id === room.opponent_id
  const isPlayer = isCreator || isOpponent
  const canJoin = !isPlayer && room.status === 'pending'
  const isMyTurn =
    gameState.status === 'active' && gameState.next_turn === currentUser?.id
  const playerOneName = room.creator.username
  const playerTwoName =
    room.opponent?.username ||
    (gameState.status === 'pending' ? 'WAITING...' : 'BOT')
  const playerOneAvatar = room.creator.avatar || getAvatarUrl(playerOneName, 80)
  const playerTwoAvatar = room.opponent?.avatar
    ? room.opponent.avatar
    : room.opponent?.username
      ? getAvatarUrl(room.opponent.username, 80)
      : ''
  const didIWin = !gameState.is_draw && gameState.winner_id === currentUser?.id

  return (
    <div className='h-full overflow-hidden bg-background text-foreground'>
      {showVictoryBlast && (
        <div className='pointer-events-none fixed inset-0 z-40 overflow-hidden'>
          <style>
            {`@keyframes confetti-drop { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(120vh) rotate(720deg); opacity: 0.2; } }`}
          </style>
          <div className='absolute inset-0 bg-linear-to-b from-fuchsia-500/20 via-yellow-400/10 to-transparent animate-pulse' />
          {CONFETTI_PIECES.map(piece => (
            <span
              key={piece.id}
              className='absolute top-[-20%] h-5 w-2 rounded-full'
              style={{
                left: `${piece.left}%`,
                backgroundColor: piece.color,
                transform: `rotate(${piece.rotate}deg)`,
                animation: `confetti-drop ${piece.duration}s linear ${piece.delay}s infinite`,
              }}
            />
          ))}
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='relative flex h-72 w-72 items-center justify-center rounded-full bg-white/15 backdrop-blur-md'>
              <div className='absolute h-72 w-72 animate-ping rounded-full bg-yellow-300/20' />
              <div className='flex flex-col items-center gap-3'>
                <PartyPopper className='h-28 w-28 text-yellow-300 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]' />
                <p className='text-4xl font-black uppercase tracking-tight text-white'>
                  You Won
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDefeatBlast && (
        <div className='pointer-events-none fixed inset-0 z-40 overflow-hidden'>
          <style>
            {`@keyframes defeat-drop { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 0.85; } 100% { transform: translateY(120vh) rotate(360deg); opacity: 0.08; } }`}
          </style>
          <div className='absolute inset-0 bg-linear-to-b from-slate-950/80 via-slate-900/60 to-black/70' />
          {DEFEAT_PIECES.map(piece => (
            <span
              key={piece.id}
              className='absolute top-[-20%] h-5 w-2 rounded-full'
              style={{
                left: `${piece.left}%`,
                backgroundColor: piece.color,
                transform: `rotate(${piece.rotate}deg)`,
                animation: `defeat-drop ${piece.duration}s linear ${piece.delay}s infinite`,
              }}
            />
          ))}
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='relative flex h-72 w-72 items-center justify-center rounded-full border border-slate-500/40 bg-black/55 backdrop-blur-md'>
              <div className='absolute h-72 w-72 animate-ping rounded-full bg-slate-600/20' />
              <div className='flex flex-col items-center gap-3'>
                <PartyPopper className='h-28 w-28 rotate-180 text-slate-400 drop-shadow-[0_0_18px_rgba(100,116,139,0.6)]' />
                <p className='text-4xl font-black uppercase tracking-tight text-slate-100'>
                  You Lost
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className='mx-auto grid h-full w-full max-w-400 gap-3 px-3 py-2 lg:grid-cols-12 lg:gap-4'>
        {/* Game Area */}
        <div className='min-h-0 overflow-hidden lg:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-blue-500/20 bg-blue-900/10 shadow-xl'>
            <CardHeader className='border-b border-blue-500/10 bg-blue-500/5 px-3 py-1.5'>
              <div className='grid w-full grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]'>
                <div className='flex items-center gap-2 md:justify-self-start'>
                  <CardTitle className='flex shrink-0 items-center gap-2 text-lg font-black text-blue-500 italic uppercase'>
                    <div className='flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm text-white'>
                      4
                    </div>
                    Connect Four
                  </CardTitle>
                  <span className='inline-flex shrink-0 items-center rounded-md border border-blue-400/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-500'>
                    Match #{id}
                  </span>
                </div>
                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1'>
                    <Avatar className='h-7 w-7 border border-red-500/30'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-red-500'>
                        Player 1
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-2 py-1'>
                    <Avatar className='h-7 w-7 border border-yellow-500/30'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500'>
                        Player 2
                      </p>
                      <p className='text-xs font-black'>{playerTwoName}</p>
                    </div>
                  </div>
                </div>
                <div className='flex md:justify-end md:justify-self-end'>
                  <div
                    className={`shrink-0 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-tight ${
                      isMyTurn
                        ? 'bg-blue-500 text-white animate-pulse'
                        : 'bg-slate-700 text-slate-100'
                    }`}
                  >
                    {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className='flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-2'>
              {gameState.status === 'active' && (
                <div
                  className={`mb-2 flex w-full max-w-150 items-center justify-center rounded-xl border px-3 py-2 text-center text-xl font-black uppercase tracking-wide ${
                    isMyTurn
                      ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                      : 'border-amber-300/60 bg-amber-500/20 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                  }`}
                >
                  {isMyTurn
                    ? 'Your Turn - Drop A Piece'
                    : "Opponent's Turn - Stand By"}
                </div>
              )}

              {/* Column Selection indicators */}
              <div className='mb-2 grid w-full max-w-150 grid-cols-7 gap-2 px-2'>
                {[...Array(7)].map((_, i) => {
                  const colId = `indicator-${i}`
                  return (
                    <div key={colId} className='flex h-7 justify-center'>
                      {hoverColumn === i &&
                        isMyTurn &&
                        gameState.status === 'active' && (
                          <ChevronDown className='text-blue-500 animate-bounce' />
                        )}
                    </div>
                  )
                })}
              </div>

              {/* The Board */}
              <div className='relative rounded-2xl border-6 border-blue-700 bg-blue-600 p-2.5 shadow-[0_20px_50px_rgba(37,99,235,0.3)]'>
                <div className='grid grid-cols-7 gap-2 rounded-xl bg-blue-800 p-2 shadow-inner md:gap-2.5'>
                  {gameState.board.map((row, r) =>
                    row.map((cell, c) => {
                      const cellId = `c4-cell-${r}-${c}`
                      return (
                        <button
                          type='button'
                          key={cellId}
                          onMouseEnter={() => setHoverColumn(c)}
                          onMouseLeave={() => setHoverColumn(null)}
                          onClick={() => makeMove(c)}
                          disabled={
                            gameState.status !== 'active' ||
                            !isMyTurn ||
                            gameState.board[0][c] !== ''
                          }
                          className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full transition-all duration-300 md:h-12 md:w-12
                                                        ${cell === '' ? 'bg-blue-950/50 shadow-inner' : ''}
                                                        ${gameState.status === 'active' && isMyTurn && gameState.board[0][c] === '' ? 'cursor-pointer hover:bg-blue-900/50' : 'cursor-default'}
                                                    `}
                        >
                          {cell === 'X' && (
                            <div className='h-4/5 w-4/5 animate-in slide-in-from-top-12 fade-in zoom-in rounded-full border-2 border-red-700 bg-linear-to-br from-red-400 to-red-600 shadow-lg duration-300' />
                          )}
                          {cell === 'O' && (
                            <div className='h-4/5 w-4/5 animate-in slide-in-from-top-12 fade-in zoom-in rounded-full border-2 border-yellow-600 bg-linear-to-br from-yellow-300 to-yellow-500 shadow-lg duration-300' />
                          )}

                          {/* Hole lighting effect */}
                          <div className='absolute inset-0 pointer-events-none rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] opacity-50' />
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {canJoin && (
                <div className='mt-6 flex flex-col items-center gap-3'>
                  <p className='text-muted-foreground font-medium'>
                    Room waiting for a challenger...
                  </p>
                  <Button
                    size='lg'
                    className='rounded-xl bg-blue-600 px-12 py-4 text-lg shadow-lg shadow-blue-500/20 hover:bg-blue-700'
                    onClick={joinGame}
                    disabled={!isSocketReady}
                  >
                    {isSocketReady ? 'Join Match' : 'Connecting...'}
                  </Button>
                </div>
              )}

              {gameState.status === 'finished' && (
                <div className='mt-6 flex flex-col items-center'>
                  <div className='mb-4 text-center'>
                    <h3 className='mb-1 text-2xl font-black italic uppercase text-blue-500'>
                      Game Over
                    </h3>
                    <p className='text-muted-foreground font-bold'>
                      Hope you had a great vibe!
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    className='px-10 border-blue-500/20 hover:bg-blue-500/5'
                    onClick={() => navigate('/games')}
                  >
                    Return to Lobby
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar: Chat & Stats */}
        <div className='flex min-h-0 flex-col lg:col-span-3'>
          <Card className='flex h-full min-h-0 flex-col overflow-hidden border-2 bg-card/50 backdrop-blur-sm'>
            <div className='p-4 bg-blue-500/5 border-b font-black text-xs uppercase tracking-widest flex items-center gap-3'>
              <div className='w-2 h-2 rounded-full bg-blue-500 animate-pulse' />
              Game Feed
            </div>
            <CardContent
              ref={chatScrollRef}
              className='flex-1 overflow-y-auto p-4 space-y-4'
            >
              {messages.length === 0 && (
                <div className='h-full flex flex-col items-center justify-center opacity-20 filter grayscale'>
                  <Send className='w-12 h-12 mb-2' />
                  <p className='text-xs font-bold uppercase tracking-tighter'>
                    No messages yet
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${m.user_id}-${i}-${m.text.slice(0, 20)}`}
                  className={`flex flex-col ${m.user_id === currentUser?.id ? 'items-end' : 'items-start'}`}
                >
                  <span className='text-[9px] uppercase font-black text-muted-foreground/60 mb-1 tracking-tighter'>
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
            </CardContent>
            <div className='p-4 border-t bg-background/80 backdrop-blur-md'>
              <div className='flex gap-2'>
                <Input
                  className='bg-card/50 border-blue-500/10 focus-visible:ring-blue-500/30'
                  placeholder='Talk some trash...'
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                />
                <Button
                  className='bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/10'
                  size='icon'
                  onClick={sendChat}
                >
                  <Send className='w-4 h-4' />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={showRematchDialog} onOpenChange={setShowRematchDialog}>
        <DialogContent className='border-2 border-blue-400/30 bg-linear-to-br from-background to-blue-950/20 sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-2xl font-black uppercase text-blue-500'>
              <PartyPopper className='h-6 w-6' />
              {didIWin ? 'Victory!' : 'Round Complete'}
            </DialogTitle>
            <DialogDescription className='text-sm font-medium'>
              {gameState.is_draw
                ? 'Draw game. Run it back?'
                : didIWin
                  ? 'Party vibes achieved. Want to play again?'
                  : 'Play another round and settle the score?'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setShowRematchDialog(false)
                navigate('/games')
              }}
            >
              Back to Lobby
            </Button>
            <Button
              onClick={() => void handlePlayAgain()}
              disabled={isStartingRematch}
            >
              {isStartingRematch ? 'Starting...' : 'Play Again'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
