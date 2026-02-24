import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { getCurrentUser, useAudio } from '@/hooks'
import { useAuthToken } from '@/hooks/useAuth'
import { useGameRoomSession } from '@/hooks/useGameRoomSession'
import { useResumableGameRoomPresence } from '@/hooks/useResumableGameRoomPresence'
import { getAvatarUrl } from '@/lib/chat-utils'

type GameStatus = 'pending' | 'active' | 'finished' | 'cancelled'
type Cell = '' | 'X' | 'O'
type Board = Cell[][]

type GameState = {
  board: Board
  status: GameStatus
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
  creator_id: number | null
  opponent_id?: number | null
}

const BOARD_SIZE = 8
const DIRECTIONS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => '')
  )
  board[3][3] = 'O'
  board[3][4] = 'X'
  board[4][3] = 'X'
  board[4][4] = 'O'
  return board
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]) as Board
}

function inBounds(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function getOpponent(symbol: Cell): Cell {
  if (symbol === 'X') return 'O'
  if (symbol === 'O') return 'X'
  return ''
}

function normalizeBoard(rawBoard: unknown, fallback?: Board): Board {
  if (!Array.isArray(rawBoard) || rawBoard.length !== BOARD_SIZE) {
    return fallback ? cloneBoard(fallback) : createInitialBoard()
  }

  const board: Board = rawBoard.map(row => {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      return Array.from({ length: BOARD_SIZE }, () => '')
    }
    return row.map(cell => (cell === 'X' || cell === 'O' ? cell : '')) as Cell[]
  }) as Board

  return board
}

function canCaptureDirection(
  board: Board,
  row: number,
  col: number,
  symbol: Cell,
  dRow: number,
  dCol: number
): boolean {
  const opponent = getOpponent(symbol)
  if (!opponent) return false

  let r = row + dRow
  let c = col + dCol
  let seenOpponent = false

  while (inBounds(r, c) && board[r][c] === opponent) {
    seenOpponent = true
    r += dRow
    c += dCol
  }

  return seenOpponent && inBounds(r, c) && board[r][c] === symbol
}

function getValidMoves(board: Board, symbol: Cell): Set<string> {
  const moves = new Set<string>()
  if (!symbol) return moves

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== '') continue
      const canCapture = DIRECTIONS.some(([dRow, dCol]) =>
        canCaptureDirection(board, row, col, symbol, dRow, dCol)
      )
      if (canCapture) {
        moves.add(`${row}-${col}`)
      }
    }
  }

  return moves
}

function countPieces(board: Board) {
  let xCount = 0
  let oCount = 0
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === 'X') xCount++
      if (board[row][col] === 'O') oCount++
    }
  }
  return { xCount, oCount }
}

function parseStatus(raw: unknown, fallback: GameStatus): GameStatus {
  if (
    raw === 'pending' ||
    raw === 'active' ||
    raw === 'finished' ||
    raw === 'cancelled'
  ) {
    return raw
  }
  return fallback
}

function parseCurrentState(raw: unknown, fallback?: Board): Board {
  if (typeof raw !== 'string' || !raw.trim()) {
    return fallback ? cloneBoard(fallback) : createInitialBoard()
  }
  try {
    const parsed = JSON.parse(raw)
    return normalizeBoard(parsed, fallback)
  } catch {
    return fallback ? cloneBoard(fallback) : createInitialBoard()
  }
}

export default function Othello() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const token = useAuthToken()
  const queryClient = useQueryClient()
  const { playDropPieceSound } = useAudio()

  const [gameState, setGameState] = useState<GameState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showRematchDialog, setShowRematchDialog] = useState(false)
  const [isStartingRematch, setIsStartingRematch] = useState(false)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const didShowEndGameUiRef = useRef(false)
  const didShowGameStartedToastRef = useRef(false)
  const movePendingRef = useRef(false)

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
    const board = parseCurrentState(room.current_state)
    setGameState({
      board,
      status: parseStatus(room.status, 'pending'),
      winner_id: room.winner_id ?? null,
      next_turn: room.next_turn_id || room.creator_id || 0,
      is_draw: room.is_draw ?? false,
    })
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
        case 'game_state': {
          movePendingRef.current = false
          setGameState(prev => {
            const previousBoard = prev?.board ?? createInitialBoard()
            const nextBoard = normalizeBoard(payload.board, previousBoard)

            if (
              prev &&
              JSON.stringify(prev.board) !== JSON.stringify(nextBoard)
            ) {
              playDropPieceSound()
            }

            return {
              board: nextBoard,
              status: parseStatus(payload.status, prev?.status ?? 'active'),
              winner_id:
                typeof payload.winner_id === 'number'
                  ? payload.winner_id
                  : null,
              next_turn:
                typeof payload.next_turn === 'number'
                  ? payload.next_turn
                  : (prev?.next_turn ?? 0),
              is_draw:
                typeof payload.is_draw === 'boolean'
                  ? payload.is_draw
                  : (prev?.is_draw ?? false),
            }
          })
          void queryClient.invalidateQueries({ queryKey: ['gameRoom', id] })
          break
        }
        case 'game_started': {
          setGameState(prev => {
            const existingBoard = prev?.board ?? createInitialBoard()
            const nextBoard =
              typeof payload.current_state === 'string'
                ? parseCurrentState(payload.current_state, existingBoard)
                : existingBoard

            return {
              board: nextBoard,
              status: parseStatus(payload.status, prev?.status ?? 'active'),
              winner_id: prev?.winner_id ?? null,
              next_turn:
                typeof payload.next_turn === 'number'
                  ? payload.next_turn
                  : (prev?.next_turn ?? 0),
              is_draw: prev?.is_draw ?? false,
            }
          })

          void queryClient.invalidateQueries({ queryKey: ['gameRoom', id] })

          if (!didShowGameStartedToastRef.current) {
            didShowGameStartedToastRef.current = true
            toast.success('Othello started', {
              description: 'Your opponent has joined.',
            })
          }
          break
        }
        case 'game_cancelled':
          toast.error('Game cancelled', {
            description: 'A player left this room.',
          })
          break
        case 'chat': {
          const userId = typeof action.user_id === 'number' ? action.user_id : 0
          const username =
            typeof payload.username === 'string' ? payload.username : 'Opponent'
          const text = typeof payload.text === 'string' ? payload.text : ''
          if (!text) return
          setMessages(prev => [...prev, { user_id: userId, username, text }])
          break
        }
        case 'error': {
          movePendingRef.current = false
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
    [id, playDropPieceSound, queryClient]
  )

  const gameSession = useGameRoomSession({
    roomId: roomId && !Number.isNaN(roomId) ? roomId : null,
    token,
    room: room
      ? {
          id: room.id,
          creator_id: room.creator_id ?? null,
          opponent_id: room.opponent_id ?? null,
          status: room.status,
        }
      : null,
    currentUserId: currentUser?.id,
    onAction: handleGameSocketAction,
    onSocketOpen: () => {
      movePendingRef.current = false
      void queryClient.invalidateQueries({ queryKey: ['gameRoom', id] })
    },
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
      setShowRematchDialog(true)
      return
    }

    if (gameState.status === 'active' || gameState.status === 'pending') {
      didShowEndGameUiRef.current = false
    }
  }, [gameState])

  const isCreator = currentUser?.id === room?.creator_id
  const isOpponent = currentUser?.id === room?.opponent_id
  const isPlayer = isCreator || isOpponent
  const mySymbol: Cell = isCreator ? 'X' : isOpponent ? 'O' : ''
  const canJoin =
    !!room &&
    !!gameState &&
    !isPlayer &&
    room.status === 'pending' &&
    gameState.status === 'pending'

  useResumableGameRoomPresence({
    userId: currentUser?.id,
    roomId,
    type: 'othello',
    status: gameState?.status,
    isParticipant: isCreator || isOpponent,
  })

  useEffect(() => {
    if (canJoin) {
      void gameSession.joinRoom()
    }
  }, [canJoin, gameSession])

  const isMyTurn =
    gameState?.status === 'active' && gameState.next_turn === currentUser?.id

  const validMoves = useMemo(() => {
    if (!gameState || !isMyTurn || !mySymbol) return new Set<string>()
    return getValidMoves(gameState.board, mySymbol)
  }, [gameState, isMyTurn, mySymbol])

  const makeMove = (row: number, col: number) => {
    if (movePendingRef.current || !gameState || !isMyTurn || !mySymbol) return

    if (!validMoves.has(`${row}-${col}`)) return

    const sent = gameSession.sendAction({
      type: 'make_move',
      payload: { row, column: col },
    })
    if (sent) {
      movePendingRef.current = true
    }
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
        'othello'
      )) as ActiveGameRoom[]

      const joinableRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id &&
          activeRoom.creator_id !== currentUser.id &&
          !activeRoom.opponent_id
      )

      if (joinableRoom) {
        setShowRematchDialog(false)
        navigate(`/games/othello/${joinableRoom.id}`)
        return
      }

      const myPendingRoom = freshRooms.find(
        activeRoom =>
          activeRoom.status === 'pending' &&
          activeRoom.creator_id === currentUser.id
      )
      if (myPendingRoom) {
        setShowRematchDialog(false)
        navigate(`/games/othello/${myPendingRoom.id}`)
        return
      }

      const newRoom = await apiClient.createGameRoom('othello')
      setShowRematchDialog(false)
      navigate(`/games/othello/${newRoom.id}`)
    } catch (error) {
      console.error('Failed to start rematch', error)
      toast.error('Could not start rematch. Please try again.')
    } finally {
      setIsStartingRematch(false)
    }
  }

  if (!roomId || Number.isNaN(roomId)) {
    return <div className='p-8 text-center'>Invalid room id.</div>
  }

  if (!room || !gameState) {
    return <div className='p-8 text-center'>Loading game...</div>
  }

  const playerOneName = room.creator?.username ?? 'Deleted User'
  const playerTwoName =
    room.opponent?.username ||
    (gameState.status === 'pending' ? 'WAITING...' : 'Opponent')
  const playerOneAvatar =
    room.creator?.avatar || getAvatarUrl(playerOneName, 80)
  const playerTwoAvatar = room.opponent?.avatar
    ? room.opponent.avatar
    : room.opponent?.username
      ? getAvatarUrl(room.opponent.username, 80)
      : ''
  const didIWin = !gameState.is_draw && gameState.winner_id === currentUser?.id
  const { xCount, oCount } = countPieces(gameState.board)

  return (
    <div className='h-full overflow-y-auto bg-background text-foreground'>
      <div className='mx-auto grid h-full w-full max-w-7xl gap-2 px-2 py-1.5 lg:grid-cols-12 lg:gap-3'>
        <div className='min-h-0 overflow-hidden lg:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-emerald-500/20 bg-emerald-950/10 shadow-xl'>
            <CardHeader className='border-b border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5'>
              <div className='grid w-full grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]'>
                <div className='flex items-center gap-2 md:justify-self-start'>
                  <CardTitle className='flex shrink-0 items-center gap-1.5 text-base font-black uppercase text-emerald-500 sm:text-lg'>
                    <Crown className='h-4 w-4 sm:h-5 sm:w-5' />
                    Othello
                  </CardTitle>
                  <span className='inline-flex shrink-0 items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-500'>
                    Match #{id}
                  </span>
                </div>
                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-slate-400/40 bg-slate-600/10 px-2 py-1'>
                    <Avatar className='h-6 w-6 border border-slate-500/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-slate-300'>
                        Black (X)
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-zinc-300/40 bg-zinc-300/20 px-2 py-1'>
                    <Avatar className='h-6 w-6 border border-zinc-300/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-zinc-200'>
                        White (O)
                      </p>
                      <p className='text-xs font-black'>{playerTwoName}</p>
                    </div>
                  </div>
                </div>
                <div className='flex md:justify-end md:justify-self-end'>
                  {gameState.status === 'active' ? (
                    <div
                      className={`shrink-0 rounded-lg px-3 py-1 text-[10px] font-black uppercase ${
                        isMyTurn
                          ? 'bg-emerald-500 text-white animate-pulse'
                          : 'bg-slate-700 text-slate-100'
                      }`}
                    >
                      {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                    </div>
                  ) : gameState.status === 'pending' ? (
                    <div className='shrink-0 rounded-lg bg-amber-600/20 px-3 py-1 text-[10px] font-black uppercase text-amber-300'>
                      Waiting...
                    </div>
                  ) : (
                    <div className='shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-[10px] font-black uppercase text-slate-100'>
                      {gameState.status}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className='flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-1.5 py-1.5 md:px-2.5 md:py-2'>
              <div className='grid min-h-0 w-full flex-1 items-center gap-1.5 lg:grid-cols-[minmax(0,1fr)_13rem]'>
                <div className='flex min-h-0 items-center justify-center'>
                  <div className='w-[min(100%,calc(100dvh-20rem))] max-w-[26rem] rounded-2xl border-4 border-emerald-700 bg-emerald-700 p-1 shadow-[0_20px_50px_rgba(5,150,105,0.35)] sm:p-1.5'>
                    <div className='grid grid-cols-8 gap-1 rounded-xl bg-emerald-900 p-1.5 md:p-2'>
                      {gameState.board.map((row, rowIndex) =>
                        row.map((cell, colIndex) => {
                          const cellKey = `${rowIndex}-${colIndex}`
                          const isValidMove = validMoves.has(cellKey)
                          return (
                            <button
                              type='button'
                              key={cellKey}
                              onClick={() => makeMove(rowIndex, colIndex)}
                              disabled={!isValidMove}
                              className={`relative flex aspect-square w-full items-center justify-center rounded-sm border border-emerald-600/40 bg-emerald-800 transition ${
                                isValidMove
                                  ? 'cursor-pointer hover:bg-emerald-700'
                                  : 'cursor-default'
                              }`}
                            >
                              {cell === 'X' && (
                                <span className='h-[78%] w-[78%] rounded-full border border-slate-800 bg-slate-900 shadow-inner' />
                              )}
                              {cell === 'O' && (
                                <span className='h-[78%] w-[78%] rounded-full border border-zinc-400 bg-zinc-100 shadow-inner' />
                              )}
                              {cell === '' && isValidMove && (
                                <span className='h-1.5 w-1.5 rounded-full bg-emerald-300/80 sm:h-2 sm:w-2' />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className='order-last mt-1 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:order-none lg:mt-0 lg:grid-cols-1 lg:content-start'>
                  <div className='rounded-lg border border-slate-500/40 bg-slate-950/30 px-3 py-2 text-center'>
                    <p className='text-[10px] font-black uppercase tracking-wider text-slate-300'>
                      Black
                    </p>
                    <p className='text-xl font-black'>{xCount}</p>
                  </div>
                  <div className='rounded-lg border border-zinc-400/40 bg-zinc-100/10 px-3 py-2 text-center'>
                    <p className='text-[10px] font-black uppercase tracking-wider text-zinc-100'>
                      White
                    </p>
                    <p className='text-xl font-black'>{oCount}</p>
                  </div>

                  {gameState.status === 'active' && (
                    <div
                      className={`col-span-2 rounded-xl border px-3 py-2 text-center text-xs font-black uppercase tracking-wide sm:col-span-1 lg:col-span-1 ${
                        isMyTurn
                          ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-100'
                          : 'border-amber-300/60 bg-amber-500/20 text-amber-100'
                      }`}
                    >
                      {isMyTurn
                        ? 'Your move - flip the board'
                        : "Opponent's move - hold tight"}
                    </div>
                  )}

                  {canJoin && (
                    <div className='col-span-2 flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 sm:col-span-3 lg:col-span-1'>
                      <p className='text-muted-foreground text-sm font-medium'>
                        Room waiting for a challenger...
                      </p>
                      <Button
                        size='lg'
                        className='w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm shadow-lg shadow-emerald-500/20 hover:bg-emerald-700'
                        onClick={joinGame}
                        disabled={!isSocketReady}
                      >
                        {isSocketReady ? 'Join Match' : 'Connecting...'}
                      </Button>
                    </div>
                  )}

                  {gameState.status === 'pending' && isCreator && (
                    <p className='text-muted-foreground col-span-2 text-center text-sm font-medium sm:col-span-3 lg:col-span-1 lg:text-left'>
                      Waiting for an opponent to join...
                    </p>
                  )}

                  {gameState.status === 'finished' && (
                    <Button
                      variant='outline'
                      className='col-span-2 border-emerald-500/30 hover:bg-emerald-500/10 sm:col-span-3 lg:col-span-1'
                      onClick={() => navigate('/games')}
                    >
                      Return to Lobby
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='flex min-h-0 flex-col lg:col-span-3'>
          <Card className='flex h-full min-h-0 flex-col overflow-hidden border-2 bg-card/50 backdrop-blur-sm'>
            <div className='flex items-center gap-3 border-b bg-emerald-500/10 p-4 text-xs font-black uppercase tracking-widest'>
              <div className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
              Game Feed
            </div>
            <CardContent
              ref={chatScrollRef}
              className='flex-1 space-y-4 overflow-y-auto p-4'
            >
              {messages.length === 0 && (
                <div className='flex h-full flex-col items-center justify-center opacity-20 grayscale'>
                  <Send className='mb-2 h-12 w-12' />
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
                  <span className='mb-1 text-[9px] font-black uppercase tracking-tighter text-muted-foreground/60'>
                    {m.username}
                  </span>
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm font-medium shadow-sm ${
                      m.user_id === currentUser?.id
                        ? 'rounded-tr-none bg-emerald-600 text-white'
                        : 'rounded-tl-none border bg-muted'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </CardContent>
            <div className='border-t bg-background/80 p-4 backdrop-blur-md'>
              <div className='flex gap-2'>
                <Input
                  className='border-emerald-500/10 bg-card/50 focus-visible:ring-emerald-500/30'
                  placeholder='Send a message...'
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                />
                <Button
                  className='bg-emerald-600 shadow-lg shadow-emerald-500/10 hover:bg-emerald-700'
                  size='icon'
                  onClick={sendChat}
                >
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={showRematchDialog} onOpenChange={setShowRematchDialog}>
        <DialogContent className='border-2 border-emerald-400/30 bg-linear-to-br from-background to-emerald-950/20 sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle className='text-2xl font-black uppercase text-emerald-500'>
              {didIWin ? 'Victory!' : 'Round Complete'}
            </DialogTitle>
            <DialogDescription className='text-sm font-medium'>
              {gameState.is_draw
                ? 'Draw game. Run it back?'
                : didIWin
                  ? 'Well played. Want another round?'
                  : 'Queue another match and settle the score?'}
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
