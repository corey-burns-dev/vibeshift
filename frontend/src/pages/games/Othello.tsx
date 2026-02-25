import { Crown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GameChat } from '@/components/games/GameChat'
import { GameResultOverlay } from '@/components/games/GameResultOverlay'
import { RematchDialog } from '@/components/games/RematchDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAudio } from '@/hooks'
import { useGameRoomCore } from '@/hooks/useGameRoomCore'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type Cell = '' | 'X' | 'O'
type Board = Cell[][]

const OTHELLO_CONFETTI_COLORS = [
  '#34d399',
  '#6ee7b7',
  '#facc15',
  '#a78bfa',
  '#fb7185',
  '#38bdf8',
] as const

const OTHELLO_DEFEAT_COLORS = [
  '#064e3b',
  '#065f46',
  '#0f172a',
  '#1e293b',
  '#134e4a',
  '#111827',
] as const

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
  const roomId = id ? Number(id) : null
  const { playDropPieceSound } = useAudio()

  const [board, setBoard] = useState<Board>(createInitialBoard)
  const isCompactViewport = useMediaQuery('(max-width: 1080px)')

  const {
    room,
    coreState,
    isSocketReady,
    sendAction,
    currentUserId,
    isCreator,
    isOpponent,
    isMyTurn,
    canJoin,
    didIWin,
    playerOneName,
    playerTwoName,
    playerOneAvatar,
    playerTwoAvatar,
    messages,
    chatInput,
    setChatInput,
    sendChat,
    chatScrollRef,
    showVictoryBlast,
    showDefeatBlast,
    showRematchDialog,
    setShowRematchDialog,
    isStartingRematch,
    joinGame,
    handlePlayAgain,
    movePendingRef,
  } = useGameRoomCore({
    roomId,
    roomIdParam: id,
    gameType: 'othello',
    gameLabel: 'Othello',
    opponentPlaceholder: 'Opponent',
    gameStartedTitle: 'Othello started',
    onBoardAction: useCallback(
      (type, payload) => {
        if (type === 'game_state') {
          setBoard(prevBoard => {
            const nextBoard = normalizeBoard(payload.board, prevBoard)

            if (JSON.stringify(prevBoard) !== JSON.stringify(nextBoard)) {
              playDropPieceSound()
            }

            return nextBoard
          })
          return
        }

        if (type === 'game_started') {
          setBoard(prevBoard => {
            if (typeof payload.current_state !== 'string') {
              return prevBoard
            }

            return parseCurrentState(payload.current_state, prevBoard)
          })
        }
      },
      [playDropPieceSound]
    ),
  })

  useEffect(() => {
    if (!room?.current_state) return
    setBoard(prevBoard => parseCurrentState(room.current_state, prevBoard))
  }, [room?.current_state])

  const mySymbol: Cell = isCreator ? 'X' : isOpponent ? 'O' : ''

  const validMoves = useMemo(() => {
    if (!coreState || !isMyTurn || !mySymbol) return new Set<string>()
    return getValidMoves(board, mySymbol)
  }, [board, coreState, isMyTurn, mySymbol])

  const makeMove = (row: number, col: number) => {
    if (movePendingRef.current || !coreState || !isMyTurn || !mySymbol) return
    if (!validMoves.has(`${row}-${col}`)) return

    const sent = sendAction({
      type: 'make_move',
      payload: { row, column: col },
    })

    if (sent) {
      movePendingRef.current = true
    }
  }

  if (!roomId || Number.isNaN(roomId)) {
    return <div className='p-8 text-center'>Invalid room id.</div>
  }

  if (!room || !coreState) {
    return <div className='p-8 text-center'>Loading game...</div>
  }

  const overlayState = showVictoryBlast
    ? 'victory'
    : showDefeatBlast
      ? 'defeat'
      : null
  const { xCount, oCount } = countPieces(board)
  const boardWidthClass = isCompactViewport
    ? 'w-[min(100%,calc(100dvh-12rem))] max-w-[34rem]'
    : 'w-[min(100%,calc(100dvh-20rem))] max-w-104'

  return (
    <div className='h-full overflow-y-auto bg-background text-foreground'>
      <GameResultOverlay
        show={overlayState}
        confettiColors={OTHELLO_CONFETTI_COLORS}
        defeatColors={OTHELLO_DEFEAT_COLORS}
      />

      <div className='mx-auto grid h-full w-full max-w-7xl gap-2 px-2 py-1.5 xl:grid-cols-12 xl:gap-3'>
        <div className='min-h-0 overflow-hidden xl:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-emerald-500/20 bg-emerald-950/10 shadow-xl'>
            <CardHeader className='border-b border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 max-[1080px]:px-1.5 max-[1080px]:py-1'>
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

                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center max-[1080px]:gap-1'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-slate-400/40 bg-slate-600/10 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-slate-500/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 max-[1080px]:hidden'>
                        Black (X)
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>

                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-zinc-300/40 bg-zinc-300/20 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-zinc-300/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-zinc-200 max-[1080px]:hidden'>
                        White (O)
                      </p>
                      <p className='text-xs font-black'>{playerTwoName}</p>
                    </div>
                  </div>
                </div>

                <div className='flex md:justify-end md:justify-self-end'>
                  {coreState.status === 'active' ? (
                    <div
                      className={`shrink-0 rounded-lg px-3 py-1 text-[10px] font-black uppercase ${
                        isMyTurn
                          ? 'animate-pulse bg-emerald-500 text-white'
                          : 'bg-slate-700 text-slate-100'
                      }`}
                    >
                      {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                    </div>
                  ) : coreState.status === 'pending' ? (
                    <div className='shrink-0 rounded-lg bg-amber-600/20 px-3 py-1 text-[10px] font-black uppercase text-amber-300'>
                      Waiting...
                    </div>
                  ) : (
                    <div className='shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-[10px] font-black uppercase text-slate-100'>
                      {coreState.status}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className='flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-1.5 py-1.5 md:px-2.5 md:py-2'>
              <div className='grid min-h-0 w-full flex-1 items-center gap-1.5 xl:grid-cols-[minmax(0,1fr)_13rem]'>
                <div className='flex min-h-0 items-center justify-center'>
                  <div
                    className={`${boardWidthClass} rounded-2xl border-4 border-emerald-700 bg-emerald-700 p-1 shadow-[0_20px_50px_rgba(5,150,105,0.35)] sm:p-1.5`}
                  >
                    <div className='grid grid-cols-8 gap-1 rounded-xl bg-emerald-900 p-1.5 md:p-2'>
                      {board.map((row, rowIndex) =>
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

                <div className='order-last mt-1 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:order-0 xl:mt-0 xl:grid-cols-1 xl:content-start'>
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

                  {coreState.status === 'active' && (
                    <div
                      className={`col-span-2 rounded-xl border px-3 py-2 text-center text-xs font-black uppercase tracking-wide sm:col-span-1 xl:col-span-1 ${
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
                    <div className='col-span-2 flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 sm:col-span-3 xl:col-span-1'>
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

                  {coreState.status === 'pending' && isCreator && (
                    <p className='text-muted-foreground col-span-2 text-center text-sm font-medium sm:col-span-3 xl:col-span-1 xl:text-left'>
                      Waiting for an opponent to join...
                    </p>
                  )}

                  {coreState.status === 'finished' && (
                    <Button
                      variant='outline'
                      className='col-span-2 border-emerald-500/30 hover:bg-emerald-500/10 sm:col-span-3 xl:col-span-1'
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

        <div className='flex min-h-0 flex-col xl:col-span-3'>
          <Card
            className={`flex min-h-0 flex-col overflow-hidden border-2 bg-card/50 backdrop-blur-sm ${isCompactViewport ? '' : 'h-full'}`}
          >
            <GameChat
              messages={messages}
              currentUserId={currentUserId}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSend={sendChat}
              accentColor='emerald'
              placeholder='Send a message...'
              chatScrollRef={chatScrollRef}
              compact={isCompactViewport}
            />
          </Card>
        </div>
      </div>

      <RematchDialog
        open={showRematchDialog}
        onOpenChange={setShowRematchDialog}
        isWin={didIWin}
        isDraw={coreState.is_draw}
        isStartingRematch={isStartingRematch}
        onPlayAgain={() => void handlePlayAgain()}
        onLobby={() => navigate('/games')}
        accentColor='emerald'
        showIcon={false}
        descriptions={{
          draw: 'Draw game. Run it back?',
          win: 'Well played. Want another round?',
          lose: 'Queue another match and settle the score?',
        }}
      />
    </div>
  )
}
