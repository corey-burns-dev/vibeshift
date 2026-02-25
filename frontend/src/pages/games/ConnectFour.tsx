import { ChevronDown, LogOut } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GameChat } from '@/components/games/GameChat'
import { GameResultOverlay } from '@/components/games/GameResultOverlay'
import { LeaveGameDialog } from '@/components/games/LeaveGameDialog'
import { RematchDialog } from '@/components/games/RematchDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAudio } from '@/hooks'
import { useGameRoomCore } from '@/hooks/useGameRoomCore'
import { useMediaQuery } from '@/hooks/useMediaQuery'

function createEmptyBoard() {
  return Array(6)
    .fill(null)
    .map(() => Array(7).fill(''))
}

export default function ConnectFour() {
  const { id } = useParams()
  const navigate = useNavigate()
  const roomId = id ? Number(id) : null
  const { playDropPieceSound } = useAudio()

  const [board, setBoard] = useState<string[][]>(createEmptyBoard)
  const [hoverColumn, setHoverColumn] = useState<number | null>(null)
  const isCompactViewport = useMediaQuery('(max-width: 1080px)')

  const {
    room,
    coreState,
    isSocketReady,
    sendAction,
    currentUserId,
    isCreator,
    isPlayer,
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
    showLeaveDialog,
    setShowLeaveDialog,
    isLeavingGame,
    joinGame,
    handlePlayAgain,
    handleLeaveGame,
    movePendingRef,
  } = useGameRoomCore({
    roomId,
    roomIdParam: id,
    gameType: 'connect4',
    gameLabel: 'Connect 4',
    opponentPlaceholder: 'BOT',
    gameStartedTitle: 'Connect 4 Started!',
    onBoardAction: useCallback(
      (type, payload) => {
        if (type !== 'game_state') return

        const rawBoard = payload.board
        const nextBoard = Array.isArray(rawBoard)
          ? (rawBoard as string[][])
          : createEmptyBoard()

        setBoard(prevBoard => {
          if (JSON.stringify(prevBoard) !== JSON.stringify(nextBoard)) {
            playDropPieceSound()
          }
          return nextBoard
        })
      },
      [playDropPieceSound]
    ),
  })

  useEffect(() => {
    if (!room?.current_state) return

    try {
      const parsedBoard = JSON.parse(room.current_state)
      setBoard(Array.isArray(parsedBoard) ? parsedBoard : createEmptyBoard())
    } catch (error) {
      console.error('Failed to parse board state', error)
    }
  }, [room?.current_state])

  const makeMove = (col: number) => {
    if (movePendingRef.current) return
    if (!coreState || coreState.status !== 'active') return
    if (coreState.next_turn !== currentUserId) return
    if (board[0][col] !== '') return

    const sent = sendAction({
      type: 'make_move',
      payload: { column: col },
    })

    if (sent) {
      movePendingRef.current = true
    }
  }

  if (!room || !coreState) {
    return <div className='p-8 text-center'>Loading game...</div>
  }

  const boardWidthClass = isCompactViewport
    ? 'w-[min(100%,calc(100dvh-12rem))] max-w-[34rem]'
    : 'w-[min(100%,calc(100dvh-20rem))] max-w-[30rem]'
  const overlayState = showVictoryBlast
    ? 'victory'
    : showDefeatBlast
      ? 'defeat'
      : null

  return (
    <div className='h-full overflow-y-auto bg-background text-foreground'>
      <GameResultOverlay show={overlayState} />

      <div className='mx-auto grid h-full w-full max-w-300 gap-2 px-2 py-1.5 xl:grid-cols-12 xl:gap-3'>
        <div className='min-h-0 overflow-hidden xl:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-blue-500/20 bg-blue-900/10 shadow-xl'>
            <CardHeader className='border-b border-blue-500/10 bg-blue-500/5 px-2 py-1.5 max-[1080px]:px-1.5 max-[1080px]:py-1'>
              <div className='grid w-full grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]'>
                <div className='flex items-center gap-2 md:justify-self-start'>
                  <CardTitle className='flex shrink-0 items-center gap-1.5 text-base font-black text-blue-500 italic uppercase sm:text-lg'>
                    <div className='flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white sm:h-6 sm:w-6 sm:text-sm'>
                      4
                    </div>
                    Connect Four
                  </CardTitle>
                  <span className='inline-flex shrink-0 items-center rounded-md border border-blue-400/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-500'>
                    Match #{id}
                  </span>
                </div>

                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center max-[1080px]:gap-1'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-red-500/30 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-red-500 max-[1080px]:hidden'>
                        Player 1
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>

                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 max-[1080px]:gap-1 max-[1080px]:px-1.5 max-[1080px]:py-0.5'>
                    <Avatar className='h-6 w-6 border border-yellow-500/30 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500 max-[1080px]:hidden'>
                        Player 2
                      </p>
                      <p className='text-xs font-black'>{playerTwoName}</p>
                    </div>
                  </div>
                </div>

                <div className='flex items-center gap-2 md:justify-end md:justify-self-end'>
                  {coreState.status === 'active' ? (
                    <div
                      className={`shrink-0 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-tight ${
                        isMyTurn
                          ? 'animate-pulse bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-100'
                      }`}
                    >
                      {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                    </div>
                  ) : coreState.status === 'pending' ? (
                    <div className='shrink-0 rounded-lg bg-amber-600/20 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-amber-300'>
                      Waiting...
                    </div>
                  ) : coreState.status === 'finished' ? (
                    <div className='shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-slate-100'>
                      Game Over
                    </div>
                  ) : null}

                  {isPlayer &&
                    (coreState.status === 'pending' ||
                      coreState.status === 'active') && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-[1080px]:h-6 max-[1080px]:w-6'
                        onClick={() => setShowLeaveDialog(true)}
                        title='Leave game'
                      >
                        <LogOut className='h-3.5 w-3.5' />
                      </Button>
                    )}
                </div>
              </div>
            </CardHeader>

            <CardContent className='flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-2 py-1.5'>
              <div
                className={`mb-1 grid ${boardWidthClass} grid-cols-7 gap-1.5 px-1.5`}
              >
                {[...Array(7)].map((_, index) => {
                  const colId = `indicator-${index}`
                  return (
                    <div key={colId} className='flex h-4 justify-center sm:h-5'>
                      {hoverColumn === index &&
                        isMyTurn &&
                        coreState.status === 'active' && (
                          <ChevronDown className='h-4 w-4 animate-bounce text-blue-500 sm:h-5 sm:w-5' />
                        )}
                    </div>
                  )
                })}
              </div>

              <div
                className={`relative ${boardWidthClass} rounded-2xl border-6 border-blue-700 bg-blue-600 p-1.5 shadow-[0_20px_50px_rgba(37,99,235,0.3)] sm:p-2`}
              >
                <div className='grid grid-cols-7 gap-1.5 rounded-xl bg-blue-800 p-1.5 shadow-inner sm:gap-2 sm:p-2'>
                  {board.map((row, rowIndex) =>
                    row.map((cell, colIndex) => {
                      const cellId = `c4-cell-${rowIndex}-${colIndex}`

                      return (
                        <button
                          type='button'
                          key={cellId}
                          onMouseEnter={() => setHoverColumn(colIndex)}
                          onMouseLeave={() => setHoverColumn(null)}
                          onClick={() => makeMove(colIndex)}
                          disabled={
                            coreState.status !== 'active' ||
                            !isMyTurn ||
                            board[0][colIndex] !== ''
                          }
                          className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full transition-all duration-300 ${
                            cell === '' ? 'bg-blue-950/50 shadow-inner' : ''
                          } ${
                            coreState.status === 'active' &&
                            isMyTurn &&
                            board[0][colIndex] === ''
                              ? 'cursor-pointer hover:bg-blue-900/50'
                              : 'cursor-default'
                          }`}
                        >
                          {cell === 'X' && (
                            <div className='h-4/5 w-4/5 animate-in slide-in-from-top-12 fade-in zoom-in rounded-full border-2 border-red-700 bg-linear-to-br from-red-400 to-red-600 shadow-lg duration-300' />
                          )}
                          {cell === 'O' && (
                            <div className='h-4/5 w-4/5 animate-in slide-in-from-top-12 fade-in zoom-in rounded-full border-2 border-yellow-600 bg-linear-to-br from-yellow-300 to-yellow-500 shadow-lg duration-300' />
                          )}
                          <div className='pointer-events-none absolute inset-0 rounded-full opacity-50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]' />
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {canJoin && (
                <div className='mt-2 flex flex-col items-center gap-2'>
                  <p className='text-muted-foreground font-medium'>
                    Room waiting for a challenger...
                  </p>
                  <Button
                    size='lg'
                    className='rounded-xl bg-blue-600 px-8 py-3 text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-700 sm:px-10'
                    onClick={joinGame}
                    disabled={!isSocketReady}
                  >
                    {isSocketReady ? 'Join Match' : 'Connecting...'}
                  </Button>
                </div>
              )}

              {coreState.status === 'pending' && isCreator && (
                <div className='mt-2 text-center'>
                  <p className='text-muted-foreground font-medium'>
                    Waiting for an opponent to join...
                  </p>
                </div>
              )}

              {coreState.status === 'finished' && (
                <div className='mt-2 flex flex-col items-center'>
                  <div className='mb-2 text-center'>
                    <h3 className='mb-1 text-xl font-black italic uppercase text-blue-500'>
                      Game Over
                    </h3>
                    <p className='text-muted-foreground font-bold'>
                      Hope you had a great vibe!
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    className='border-blue-500/20 px-8 hover:bg-blue-500/5'
                    onClick={() => navigate('/games')}
                  >
                    Return to Lobby
                  </Button>
                </div>
              )}
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
              accentColor='blue'
              placeholder='Talk some trash...'
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
        accentColor='blue'
        showIcon
        descriptions={{
          draw: 'Draw game. Run it back?',
          win: 'Party vibes achieved. Want to play again?',
          lose: 'Play another round and settle the score?',
        }}
      />

      <LeaveGameDialog
        open={showLeaveDialog}
        onOpenChange={setShowLeaveDialog}
        isLeaving={isLeavingGame}
        onLeave={() => void handleLeaveGame()}
      />
    </div>
  )
}
