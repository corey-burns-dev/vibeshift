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
import { cn } from '@/lib/utils'

type Piece = '' | 'r' | 'R' | 'b' | 'B'
type Board = Piece[][]

interface CheckersState {
  board: Board
  must_jump_from: [number, number] | null
}

const CHECKERS_CONFETTI_COLORS = [
  '#f59e0b',
  '#fbbf24',
  '#d97706',
  '#facc15',
  '#fb923c',
  '#f97316',
] as const

const CHECKERS_DEFEAT_COLORS = [
  '#451a03',
  '#78350f',
  '#0f172a',
  '#1e293b',
  '#292524',
  '#111827',
] as const

const BOARD_SIZE = 8

function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => '' as Piece)
  )
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) board[row][col] = 'b'
    }
  }
  for (let row = 5; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) board[row][col] = 'r'
    }
  }
  return board
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]) as Board
}

function inBounds(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function isSide(cell: Piece, side: 'r' | 'b'): boolean {
  if (side === 'r') return cell === 'r' || cell === 'R'
  return cell === 'b' || cell === 'B'
}

function isKing(cell: Piece): boolean {
  return cell === 'R' || cell === 'B'
}

function getDirs(cell: Piece): [number, number][] {
  if (cell === 'R' || cell === 'B') {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]
  }
  if (cell === 'r')
    return [
      [-1, -1],
      [-1, 1],
    ]
  if (cell === 'b')
    return [
      [1, -1],
      [1, 1],
    ]
  return []
}

function opponentSide(side: 'r' | 'b'): 'r' | 'b' {
  return side === 'r' ? 'b' : 'r'
}

function getJumps(board: Board, row: number, col: number): [number, number][] {
  const cell = board[row][col]
  if (!cell) return []
  const side = cell === 'r' || cell === 'R' ? 'r' : 'b'
  const opp = opponentSide(side)
  const dirs = getDirs(cell)
  const jumps: [number, number][] = []

  for (const [dr, dc] of dirs) {
    const mr = row + dr
    const mc = col + dc
    const lr = row + 2 * dr
    const lc = col + 2 * dc
    if (
      inBounds(lr, lc) &&
      isSide(board[mr][mc], opp) &&
      board[lr][lc] === ''
    ) {
      jumps.push([lr, lc])
    }
  }
  return jumps
}

function getSimpleMoves(
  board: Board,
  row: number,
  col: number
): [number, number][] {
  const cell = board[row][col]
  if (!cell) return []
  const dirs = getDirs(cell)
  const moves: [number, number][] = []

  for (const [dr, dc] of dirs) {
    const nr = row + dr
    const nc = col + dc
    if (inBounds(nr, nc) && board[nr][nc] === '') {
      moves.push([nr, nc])
    }
  }
  return moves
}

function hasAnyJump(board: Board, side: 'r' | 'b'): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isSide(board[r][c], side) && getJumps(board, r, c).length > 0) {
        return true
      }
    }
  }
  return false
}

function getValidMoves(
  board: Board,
  row: number,
  col: number,
  side: 'r' | 'b',
  mustJumpFrom: [number, number] | null
): [number, number][] {
  if (!isSide(board[row][col], side)) return []

  if (mustJumpFrom) {
    if (mustJumpFrom[0] !== row || mustJumpFrom[1] !== col) return []
    return getJumps(board, row, col)
  }

  const jumps = getJumps(board, row, col)
  if (jumps.length > 0) return jumps

  if (hasAnyJump(board, side)) return []

  return getSimpleMoves(board, row, col)
}

function getSelectablePieces(
  board: Board,
  side: 'r' | 'b',
  mustJumpFrom: [number, number] | null
): Set<string> {
  const set = new Set<string>()
  if (mustJumpFrom) {
    if (getJumps(board, mustJumpFrom[0], mustJumpFrom[1]).length > 0) {
      set.add(`${mustJumpFrom[0]}-${mustJumpFrom[1]}`)
    }
    return set
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (
        isSide(board[r][c], side) &&
        getValidMoves(board, r, c, side, null).length > 0
      ) {
        set.add(`${r}-${c}`)
      }
    }
  }
  return set
}

function normalizeBoard(rawBoard: unknown, fallback?: Board): Board {
  if (!Array.isArray(rawBoard) || rawBoard.length !== BOARD_SIZE) {
    return fallback ? cloneBoard(fallback) : createInitialBoard()
  }

  return rawBoard.map(row => {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      return Array.from({ length: BOARD_SIZE }, () => '' as Piece)
    }
    return row.map(cell => {
      if (cell === 'r' || cell === 'R' || cell === 'b' || cell === 'B')
        return cell as Piece
      return '' as Piece
    })
  }) as Board
}

function parseCurrentState(raw: unknown, fallback?: Board): CheckersState {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      board: fallback ? cloneBoard(fallback) : createInitialBoard(),
      must_jump_from: null,
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      board?: unknown
      must_jump_from?: [number, number] | null
    }
    return {
      board: normalizeBoard(parsed.board, fallback),
      must_jump_from: parsed.must_jump_from ?? null,
    }
  } catch {
    return {
      board: fallback ? cloneBoard(fallback) : createInitialBoard(),
      must_jump_from: null,
    }
  }
}

function countPieces(board: Board) {
  let rCount = 0
  let bCount = 0
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (isSide(board[row][col], 'r')) rCount++
      if (isSide(board[row][col], 'b')) bCount++
    }
  }
  return { rCount, bCount }
}

export default function Checkers() {
  const { id } = useParams()
  const navigate = useNavigate()
  const roomId = id ? Number(id) : null
  const { playDropPieceSound } = useAudio()

  const [board, setBoard] = useState<Board>(createInitialBoard)
  const [mustJumpFrom, setMustJumpFrom] = useState<[number, number] | null>(
    null
  )
  const [selectedPiece, setSelectedPiece] = useState<[number, number] | null>(
    null
  )
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
    gameType: 'checkers',
    gameLabel: 'Checkers',
    opponentPlaceholder: 'Opponent',
    gameStartedTitle: 'Checkers started',
    onBoardAction: useCallback(
      (type, payload) => {
        if (type === 'game_state') {
          const state = payload as {
            board?: unknown
            must_jump_from?: [number, number] | null
          }
          setBoard(prevBoard => {
            const nextBoard = normalizeBoard(state.board, prevBoard)
            if (JSON.stringify(prevBoard) !== JSON.stringify(nextBoard)) {
              playDropPieceSound()
            }
            return nextBoard
          })
          setMustJumpFrom(state.must_jump_from ?? null)
          return
        }

        if (type === 'game_started') {
          if (typeof payload.current_state !== 'string') return
          const parsed = parseCurrentState(payload.current_state)
          setBoard(parsed.board)
          setMustJumpFrom(parsed.must_jump_from)
        }
      },
      [playDropPieceSound]
    ),
  })

  useEffect(() => {
    if (!room?.current_state) return
    const parsed = parseCurrentState(room.current_state)
    setBoard(parsed.board)
    setMustJumpFrom(parsed.must_jump_from)
  }, [room?.current_state])

  const mySide: 'r' | 'b' | null = isCreator ? 'r' : isOpponent ? 'b' : null

  // Clear selection on turn change, unless multi-jump
  useEffect(() => {
    if (mustJumpFrom) {
      setSelectedPiece(mustJumpFrom)
    } else {
      setSelectedPiece(null)
    }
  }, [coreState?.next_turn, mustJumpFrom])

  const selectablePieces = useMemo(() => {
    if (!coreState || !isMyTurn || !mySide) return new Set<string>()
    return getSelectablePieces(board, mySide, mustJumpFrom)
  }, [board, coreState, isMyTurn, mySide, mustJumpFrom])

  const validMoves = useMemo(() => {
    if (!selectedPiece || !mySide) return new Set<string>()
    const moves = getValidMoves(
      board,
      selectedPiece[0],
      selectedPiece[1],
      mySide,
      mustJumpFrom
    )
    return new Set(moves.map(([r, c]) => `${r}-${c}`))
  }, [board, selectedPiece, mySide, mustJumpFrom])

  const handleCellClick = (row: number, col: number) => {
    if (!coreState || !isMyTurn || !mySide) return

    const cellKey = `${row}-${col}`

    // If clicking a valid move destination, send the move
    if (selectedPiece && validMoves.has(cellKey)) {
      if (movePendingRef.current) return

      const sent = sendAction({
        type: 'make_move',
        payload: {
          from: [selectedPiece[0], selectedPiece[1]],
          to: [row, col],
        },
      })

      if (sent) {
        movePendingRef.current = true
        setSelectedPiece(null)
      }
      return
    }

    // If clicking a selectable piece, select it
    if (selectablePieces.has(cellKey)) {
      setSelectedPiece([row, col])
      return
    }

    // Clicking empty/invalid — deselect (unless multi-jump lock)
    if (!mustJumpFrom) {
      setSelectedPiece(null)
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
  const { rCount, bCount } = countPieces(board)
  const boardWidthClass = isCompactViewport
    ? 'w-[min(100%,calc(100dvh-12rem))] max-w-[34rem]'
    : 'w-[min(100%,calc(100dvh-20rem))] max-w-104'

  return (
    <div className='h-full overflow-y-auto bg-background text-foreground'>
      <GameResultOverlay
        show={overlayState}
        confettiColors={CHECKERS_CONFETTI_COLORS}
        defeatColors={CHECKERS_DEFEAT_COLORS}
      />

      <div className='mx-auto grid h-full w-full max-w-7xl gap-2 px-2 py-1.5 xl:grid-cols-12 xl:gap-3'>
        <div className='min-h-0 overflow-hidden xl:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-amber-500/20 bg-amber-950/10 shadow-xl'>
            <CardHeader className='border-b border-amber-500/20 bg-amber-500/5 px-2 py-1.5 max-[1080px]:px-1.5 max-[1080px]:py-1'>
              <div className='grid w-full grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]'>
                <div className='flex items-center gap-2 md:justify-self-start'>
                  <CardTitle className='flex shrink-0 items-center gap-1.5 text-base font-black uppercase text-amber-500 sm:text-lg'>
                    <Crown className='h-4 w-4 sm:h-5 sm:w-5' />
                    Checkers
                  </CardTitle>
                  <span className='inline-flex shrink-0 items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-500'>
                    Match #{id}
                  </span>
                </div>

                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center max-[1080px]:gap-1'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-600/10 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-amber-500/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-amber-300 max-[1080px]:hidden'>
                        Red
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>

                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-slate-400/40 bg-slate-600/10 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-slate-500/40 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 max-[1080px]:hidden'>
                        Black
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
                          ? 'animate-pulse bg-amber-500 text-white'
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
                    className={`${boardWidthClass} rounded-2xl border-4 border-amber-900 bg-amber-900 p-1 shadow-[0_20px_50px_rgba(217,119,6,0.25)] sm:p-1.5`}
                  >
                    <div className='grid grid-cols-8 gap-0 rounded-xl overflow-hidden'>
                      {board.map((row, rowIndex) =>
                        row.map((cell, colIndex) => {
                          const cellKey = `${rowIndex}-${colIndex}`
                          const isDark = (rowIndex + colIndex) % 2 === 1
                          const isSelected =
                            selectedPiece?.[0] === rowIndex &&
                            selectedPiece?.[1] === colIndex
                          const isValidMove = validMoves.has(cellKey)
                          const isSelectable = selectablePieces.has(cellKey)

                          return (
                            <button
                              type='button'
                              key={cellKey}
                              onClick={() =>
                                handleCellClick(rowIndex, colIndex)
                              }
                              className={cn(
                                'relative flex aspect-square w-full items-center justify-center transition-colors',
                                isDark ? 'bg-amber-900/60' : 'bg-amber-100/20',
                                isSelected &&
                                  isDark &&
                                  'ring-2 ring-inset ring-amber-300',
                                isSelectable &&
                                  !isSelected &&
                                  isDark &&
                                  'cursor-pointer hover:bg-amber-800/80',
                                isValidMove &&
                                  'cursor-pointer hover:bg-amber-700/60',
                                !isSelectable &&
                                  !isValidMove &&
                                  'cursor-default'
                              )}
                            >
                              {isSide(cell, 'r') && (
                                <span
                                  className={cn(
                                    'flex h-[76%] w-[76%] items-center justify-center rounded-full border-2 shadow-md',
                                    'border-amber-400 bg-amber-500',
                                    isSelected &&
                                      'ring-2 ring-amber-200 ring-offset-1 ring-offset-amber-900'
                                  )}
                                >
                                  {isKing(cell) && (
                                    <Crown className='h-[55%] w-[55%] text-amber-100' />
                                  )}
                                </span>
                              )}
                              {isSide(cell, 'b') && (
                                <span
                                  className={cn(
                                    'flex h-[76%] w-[76%] items-center justify-center rounded-full border-2 shadow-md',
                                    'border-slate-500 bg-slate-700',
                                    isSelected &&
                                      'ring-2 ring-slate-300 ring-offset-1 ring-offset-amber-900'
                                  )}
                                >
                                  {isKing(cell) && (
                                    <Crown className='h-[55%] w-[55%] text-slate-200' />
                                  )}
                                </span>
                              )}
                              {cell === '' && isValidMove && isDark && (
                                <span className='h-2 w-2 rounded-full bg-amber-300/70 sm:h-2.5 sm:w-2.5' />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className='order-last mt-1 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:order-0 xl:mt-0 xl:grid-cols-1 xl:content-start'>
                  <div className='rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-center'>
                    <p className='text-[10px] font-black uppercase tracking-wider text-amber-300'>
                      Red
                    </p>
                    <p className='text-xl font-black'>{rCount}</p>
                  </div>
                  <div className='rounded-lg border border-slate-500/40 bg-slate-950/30 px-3 py-2 text-center'>
                    <p className='text-[10px] font-black uppercase tracking-wider text-slate-300'>
                      Black
                    </p>
                    <p className='text-xl font-black'>{bCount}</p>
                  </div>

                  {coreState.status === 'active' && (
                    <div
                      className={`col-span-2 rounded-xl border px-3 py-2 text-center text-xs font-black uppercase tracking-wide sm:col-span-1 xl:col-span-1 ${
                        isMyTurn
                          ? 'border-amber-300/60 bg-amber-500/20 text-amber-100'
                          : 'border-slate-300/60 bg-slate-500/20 text-slate-100'
                      }`}
                    >
                      {isMyTurn
                        ? mustJumpFrom
                          ? 'Continue jumping!'
                          : 'Your move'
                        : "Opponent's move"}
                    </div>
                  )}

                  {canJoin && (
                    <div className='col-span-2 flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 sm:col-span-3 xl:col-span-1'>
                      <p className='text-muted-foreground text-sm font-medium'>
                        Room waiting for a challenger...
                      </p>
                      <Button
                        size='lg'
                        className='w-full rounded-xl bg-amber-600 px-4 py-3 text-sm shadow-lg shadow-amber-500/20 hover:bg-amber-700'
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
                      className='col-span-2 border-amber-500/30 hover:bg-amber-500/10 sm:col-span-3 xl:col-span-1'
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
              accentColor='amber'
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
        accentColor='amber'
        showIcon={false}
        descriptions={{
          draw: 'Draw game. Run it back?',
          win: 'Crowned them all. Want another round?',
          lose: 'Queue another match and settle the score?',
        }}
      />
    </div>
  )
}
