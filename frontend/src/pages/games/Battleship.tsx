import { LogOut, RotateCcw, Ship } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GameChat } from '@/components/games/GameChat'
import { GameResultOverlay } from '@/components/games/GameResultOverlay'
import { LeaveGameDialog } from '@/components/games/LeaveGameDialog'
import { RematchDialog } from '@/components/games/RematchDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGameRoomCore } from '@/hooks/useGameRoomCore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlacedShip {
  name: string
  size: number
  row: number
  col: number
  horizontal: boolean
}

interface BattleshipState {
  phase: 'setup' | 'battle'
  creator_ready: boolean
  opponent_ready: boolean
  creator_ships: PlacedShip[]
  opponent_ships: PlacedShip[]
  creator_shots: [number, number][]
  opponent_shots: [number, number][]
}

interface ShipDef {
  name: string
  size: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLEET: ShipDef[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
]

const GRID_SIZE = 10
const COLUMN_LABELS = Array.from({ length: GRID_SIZE }, (_, index) =>
  String.fromCharCode(65 + index)
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shipCellSet(ships: PlacedShip[]): Set<string> {
  const cells = new Set<string>()
  for (const ship of ships) {
    for (let i = 0; i < ship.size; i++) {
      const r = ship.horizontal ? ship.row : ship.row + i
      const c = ship.horizontal ? ship.col + i : ship.col
      cells.add(`${r},${c}`)
    }
  }
  return cells
}

function shotSet(shots: [number, number][]): Set<string> {
  return new Set(shots.map(s => `${s[0]},${s[1]}`))
}

function isShipFullySunk(ship: PlacedShip, shots: Set<string>): boolean {
  for (let i = 0; i < ship.size; i++) {
    const r = ship.horizontal ? ship.row : ship.row + i
    const c = ship.horizontal ? ship.col + i : ship.col
    if (!shots.has(`${r},${c}`)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// ShipVisual
// ---------------------------------------------------------------------------

function ShipVisual({ size }: { size: number }) {
  return (
    <div className='flex flex-row gap-0.5'>
      {Array.from({ length: size }, (_, segment) => segment + 1).map(
        segment => (
          <div
            key={`ship-segment-${segment}`}
            className='h-3.5 w-3.5 rounded-sm bg-teal-600/60 border border-teal-500/40'
          />
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BoardGrid
// ---------------------------------------------------------------------------

interface BoardGridProps {
  label: string
  myBoard: boolean
  defenseShips: PlacedShip[]
  incomingShots: Set<string>
  myShots: Set<string>
  opponentShipCells: Set<string>
  sunkCells: Set<string>
  isMyTurn: boolean
  gameActive: boolean
  onCellClick?: (row: number, col: number) => void
  onCellHover?: (row: number, col: number) => void
  onCellLeave?: () => void
  hoverCell?: [number, number] | null
}

function BoardGrid({
  label,
  myBoard,
  defenseShips,
  incomingShots,
  myShots,
  opponentShipCells,
  sunkCells,
  isMyTurn,
  gameActive,
  onCellClick,
  onCellHover,
  onCellLeave,
  hoverCell,
}: BoardGridProps) {
  const myShipCellSet = useMemo(() => shipCellSet(defenseShips), [defenseShips])

  const getCellClass = (row: number, col: number): string => {
    const key = `${row},${col}`
    const isHover = hoverCell && hoverCell[0] === row && hoverCell[1] === col
    const canTarget = !myBoard && gameActive && isMyTurn && !myShots.has(key)

    if (myBoard) {
      const isMyShip = myShipCellSet.has(key)
      const isHit = incomingShots.has(key) && isMyShip
      const isMiss = incomingShots.has(key) && !isMyShip
      if (isHit) return 'bg-red-600 border-red-700'
      if (isMiss) return 'bg-slate-600/50 border-slate-500'
      if (isMyShip) return 'bg-teal-700/60 border-teal-600/60'
      return 'bg-slate-700/30 border-slate-600/30'
    }

    // Attack board
    const isSunk = sunkCells.has(key)
    const isHit = myShots.has(key) && opponentShipCells.has(key)
    const isMiss = myShots.has(key) && !opponentShipCells.has(key)

    if (isSunk) return 'bg-orange-600 border-orange-500'
    if (isHit) return 'bg-red-500 border-red-600'
    if (isMiss) return 'bg-slate-500/40 border-slate-400/40'
    if (isHover && canTarget) return 'bg-teal-500/40 border-teal-400'
    if (canTarget)
      return 'bg-slate-700/30 border-slate-600/30 hover:bg-teal-500/20 hover:border-teal-500/40 cursor-crosshair'
    return 'bg-slate-700/30 border-slate-600/30'
  }

  return (
    <div className='flex flex-col gap-1'>
      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-center text-teal-400/70'>
        {label}
      </p>
      <div className='rounded-xl border-2 border-teal-700/60 bg-teal-950/40 p-1.5 shadow-inner'>
        <div
          className='grid gap-0.5'
          style={{
            gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: GRID_SIZE }).map((_, row) =>
            Array.from({ length: GRID_SIZE }).map((_, col) => {
              const key = `${row},${col}`
              const isMiss = myBoard
                ? incomingShots.has(key) && !myShipCellSet.has(key)
                : myShots.has(key) && !opponentShipCells.has(key)

              return (
                <button
                  type='button'
                  key={key}
                  onClick={() => onCellClick?.(row, col)}
                  onMouseEnter={() => onCellHover?.(row, col)}
                  onMouseLeave={() => onCellLeave?.()}
                  disabled={
                    myBoard || !gameActive || !isMyTurn || myShots.has(key)
                  }
                  className={`relative flex aspect-square w-full items-center justify-center rounded-sm border transition-colors duration-150 ${getCellClass(row, col)}`}
                >
                  {isMiss && (
                    <div className='h-1.5 w-1.5 rounded-full bg-white/60' />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className='flex gap-0.5 px-1.5'>
        {COLUMN_LABELS.map(label => (
          <div
            key={label}
            className='flex-1 text-center text-[8px] text-slate-500 font-mono'
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Battleship component
// ---------------------------------------------------------------------------

export default function Battleship() {
  const { id } = useParams()
  const navigate = useNavigate()
  const roomId = id ? Number(id) : null

  const [gameState, setGameState] = useState<BattleshipState | null>(null)

  // Setup phase
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([])
  const [selectedShip, setSelectedShip] = useState<ShipDef | null>(FLEET[0])
  const [horizontal, setHorizontal] = useState(true)
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null)
  const [shipsSubmitted, setShipsSubmitted] = useState(false)

  const {
    room,
    coreState,
    isSocketReady,
    sendAction,
    currentUserId,
    isCreator,
    isOpponent,
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
    gameType: 'battleship',
    gameLabel: 'Battleship',
    opponentPlaceholder: 'Waiting...',
    gameStartedTitle: 'Battleship Started!',
    onBoardAction: useCallback(
      (type: string, payload: Record<string, unknown>) => {
        if (type !== 'game_state') return
        const s = payload.board
        if (s && typeof s === 'object' && 'phase' in (s as object)) {
          setGameState(s as BattleshipState)
        }
      },
      []
    ),
  })

  // Seed state from persisted room.current_state on load / reconnect
  useEffect(() => {
    if (!room?.current_state) return
    try {
      const parsed = JSON.parse(room.current_state) as BattleshipState
      if (parsed && typeof parsed === 'object' && 'phase' in parsed) {
        setGameState(parsed)
      }
    } catch {
      // ignore
    }
  }, [room?.current_state])

  // Restore shipsSubmitted on reconnect if server already has our ships
  useEffect(() => {
    if (!gameState) return
    if (isCreator && gameState.creator_ready) setShipsSubmitted(true)
    if (isOpponent && gameState.opponent_ready) setShipsSubmitted(true)
  }, [gameState, isCreator, isOpponent])

  // R key to rotate orientation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setHorizontal(h => !h)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const myShipCells = useMemo(() => shipCellSet(placedShips), [placedShips])

  const myShotsSet = useMemo((): Set<string> => {
    if (!gameState) return new Set()
    const shots = isCreator ? gameState.creator_shots : gameState.opponent_shots
    return shotSet(shots ?? [])
  }, [gameState, isCreator])

  const incomingShotsSet = useMemo((): Set<string> => {
    if (!gameState) return new Set()
    const shots = isCreator ? gameState.opponent_shots : gameState.creator_shots
    return shotSet(shots ?? [])
  }, [gameState, isCreator])

  const myDefenseShips = useMemo((): PlacedShip[] => {
    if (!gameState) return []
    return isCreator
      ? (gameState.creator_ships ?? [])
      : (gameState.opponent_ships ?? [])
  }, [gameState, isCreator])

  const opponentShipsList = useMemo((): PlacedShip[] => {
    if (!gameState) return []
    return isCreator
      ? (gameState.opponent_ships ?? [])
      : (gameState.creator_ships ?? [])
  }, [gameState, isCreator])

  const opponentShipCellSet = useMemo(
    () => shipCellSet(opponentShipsList),
    [opponentShipsList]
  )

  const sunkOpponentCells = useMemo((): Set<string> => {
    const sunk = new Set<string>()
    for (const ship of opponentShipsList) {
      if (isShipFullySunk(ship, myShotsSet)) {
        for (let i = 0; i < ship.size; i++) {
          const r = ship.horizontal ? ship.row : ship.row + i
          const c = ship.horizontal ? ship.col + i : ship.col
          sunk.add(`${r},${c}`)
        }
      }
    }
    return sunk
  }, [opponentShipsList, myShotsSet])

  // ---------------------------------------------------------------------------
  // Setup logic
  // ---------------------------------------------------------------------------

  const canPlaceShip = useCallback(
    (row: number, col: number, ship: ShipDef, horiz: boolean): boolean => {
      for (let i = 0; i < ship.size; i++) {
        const r = horiz ? row : row + i
        const c = horiz ? col + i : col
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false
        if (myShipCells.has(`${r},${c}`)) return false
      }
      return true
    },
    [myShipCells]
  )

  const previewCells = useMemo((): Set<string> => {
    if (!hoverCell || !selectedShip) return new Set()
    const [r, c] = hoverCell
    const cells = new Set<string>()
    for (let i = 0; i < selectedShip.size; i++) {
      const pr = horizontal ? r : r + i
      const pc = horizontal ? c + i : c
      cells.add(`${pr},${pc}`)
    }
    return cells
  }, [hoverCell, selectedShip, horizontal])

  const previewValid = useMemo((): boolean => {
    if (!hoverCell || !selectedShip) return false
    return canPlaceShip(hoverCell[0], hoverCell[1], selectedShip, horizontal)
  }, [hoverCell, selectedShip, horizontal, canPlaceShip])

  const handleSetupCellClick = (row: number, col: number) => {
    if (!selectedShip || shipsSubmitted) return
    if (!canPlaceShip(row, col, selectedShip, horizontal)) return
    const placed: PlacedShip = { ...selectedShip, row, col, horizontal }
    const newPlaced = [
      ...placedShips.filter(p => p.name !== selectedShip.name),
      placed,
    ]
    setPlacedShips(newPlaced)
    const placedNames = new Set(newPlaced.map(p => p.name))
    const next = FLEET.find(s => !placedNames.has(s.name))
    setSelectedShip(next ?? null)
  }

  const submitFleet = () => {
    if (placedShips.length !== FLEET.length || shipsSubmitted) return
    const sent = sendAction({
      type: 'place_ships',
      payload: { ships: placedShips },
    })
    if (sent) setShipsSubmitted(true)
  }

  // ---------------------------------------------------------------------------
  // Battle logic
  // ---------------------------------------------------------------------------

  const makeShot = (row: number, col: number) => {
    if (movePendingRef.current) return
    if (!gameState || gameState.phase !== 'battle') return
    if (!coreState || coreState.status !== 'active') return
    if (coreState.next_turn !== currentUserId) return
    if (myShotsSet.has(`${row},${col}`)) return
    const sent = sendAction({ type: 'make_move', payload: { row, col } })
    if (sent) movePendingRef.current = true
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const amIReady = isCreator
    ? (gameState?.creator_ready ?? false)
    : (gameState?.opponent_ready ?? false)
  const isSetupPhase = !gameState || gameState.phase === 'setup'
  const isBattlePhase = gameState?.phase === 'battle'
  const overlayState = showVictoryBlast
    ? 'victory'
    : showDefeatBlast
      ? 'defeat'
      : null

  if (!room || !coreState) {
    return <div className='p-8 text-center'>Loading game...</div>
  }

  return (
    <div className='h-full overflow-y-auto bg-background text-foreground'>
      <GameResultOverlay show={overlayState} />

      <div className='mx-auto grid h-full w-full max-w-300 gap-2 px-2 py-1.5 lg:grid-cols-12 lg:gap-3'>
        {/* Main game card */}
        <div className='min-h-0 overflow-hidden lg:col-span-9'>
          <Card className='flex h-full flex-col border-2 border-teal-500/20 bg-teal-900/10 shadow-xl'>
            <CardHeader className='border-b border-teal-500/10 bg-teal-500/5 px-2.5 py-1.5'>
              <div className='grid w-full grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]'>
                {/* Title */}
                <div className='flex items-center gap-2 md:justify-self-start'>
                  <CardTitle className='flex shrink-0 items-center gap-1.5 text-base font-black text-teal-400 italic uppercase sm:text-lg'>
                    <Ship className='h-4 w-4 sm:h-5 sm:w-5' />
                    Battleship
                  </CardTitle>
                  <span className='inline-flex shrink-0 items-center rounded-md border border-teal-400/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-teal-400'>
                    Match #{id}
                  </span>
                </div>

                {/* Players */}
                <div className='flex min-w-0 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap md:justify-self-center'>
                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-teal-500/40 bg-teal-500/10 px-2 py-1'>
                    <Avatar className='h-6 w-6 border border-teal-500/30 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerOneAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerOneName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-teal-400'>
                        Commander 1
                      </p>
                      <p className='text-xs font-black'>{playerOneName}</p>
                    </div>
                  </div>

                  <span className='text-xs font-black text-slate-500'>vs</span>

                  <div className='flex shrink-0 items-center gap-2 rounded-lg border border-slate-500/40 bg-slate-500/10 px-2 py-1'>
                    <Avatar className='h-6 w-6 border border-slate-500/30 sm:h-7 sm:w-7'>
                      <AvatarImage src={playerTwoAvatar} />
                      <AvatarFallback className='text-[10px] font-black'>
                        {playerTwoName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='text-[9px] font-black uppercase tracking-[0.2em] text-slate-400'>
                        Commander 2
                      </p>
                      <p className='text-xs font-black'>{playerTwoName}</p>
                    </div>
                  </div>
                </div>

                {/* Status + leave */}
                <div className='flex items-center gap-2 md:justify-end md:justify-self-end'>
                  {coreState.status === 'pending' && (
                    <div className='shrink-0 rounded-lg bg-amber-600/20 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-amber-300'>
                      Waiting...
                    </div>
                  )}
                  {coreState.status === 'finished' && (
                    <div className='shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-slate-100'>
                      Game Over
                    </div>
                  )}
                  {coreState.status === 'active' && isSetupPhase && (
                    <div className='shrink-0 rounded-lg bg-teal-600/20 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-teal-300'>
                      Placing Ships
                    </div>
                  )}
                  {coreState.status === 'active' && isBattlePhase && (
                    <div
                      className={`shrink-0 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-tight ${
                        isMyTurn
                          ? 'animate-pulse bg-teal-500 text-white'
                          : 'bg-slate-700 text-slate-100'
                      }`}
                    >
                      {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                    </div>
                  )}
                  {isPlayer &&
                    (coreState.status === 'pending' ||
                      coreState.status === 'active') && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        onClick={() => setShowLeaveDialog(true)}
                        title='Leave game'
                      >
                        <LogOut className='h-3.5 w-3.5' />
                      </Button>
                    )}
                </div>
              </div>
            </CardHeader>

            <CardContent className='flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 py-3'>
              {/* Pending — waiting for opponent */}
              {coreState.status === 'pending' && isPlayer && (
                <div className='flex flex-col items-center gap-3 text-center'>
                  <Ship className='h-12 w-12 text-teal-500/40 animate-pulse' />
                  <p className='text-muted-foreground font-medium'>
                    Waiting for an opponent to join...
                  </p>
                </div>
              )}

              {/* Join button */}
              {canJoin && (
                <div className='flex flex-col items-center gap-3'>
                  <Ship className='h-10 w-10 text-teal-500/50' />
                  <p className='text-muted-foreground font-medium'>
                    Room waiting for a challenger...
                  </p>
                  <Button
                    size='lg'
                    className='rounded-xl bg-teal-600 px-8 py-3 text-sm shadow-lg shadow-teal-500/20 hover:bg-teal-700 sm:px-10'
                    onClick={joinGame}
                    disabled={!isSocketReady}
                  >
                    {isSocketReady ? 'Join Match' : 'Connecting...'}
                  </Button>
                </div>
              )}

              {/* Setup Phase */}
              {coreState.status === 'active' && isSetupPhase && isPlayer && (
                <div className='w-full max-w-3xl'>
                  {shipsSubmitted || amIReady ? (
                    <div className='flex flex-col items-center gap-4 py-8 text-center'>
                      <Ship className='h-12 w-12 text-teal-500 animate-pulse' />
                      <h3 className='text-lg font-black uppercase italic text-teal-400'>
                        Fleet Deployed!
                      </h3>
                      <p className='text-sm text-muted-foreground font-medium'>
                        Waiting for your opponent to finish placing their
                        fleet...
                      </p>
                    </div>
                  ) : (
                    <div className='flex flex-col gap-4 md:flex-row md:items-start md:gap-6'>
                      {/* Fleet panel */}
                      <div className='flex flex-col gap-3 md:w-44 shrink-0'>
                        <h3 className='text-[10px] font-black uppercase tracking-[0.2em] text-teal-400'>
                          Your Fleet
                        </h3>
                        {FLEET.map(ship => {
                          const isPlaced = placedShips.some(
                            p => p.name === ship.name
                          )
                          const isSelected = selectedShip?.name === ship.name
                          return (
                            <button
                              key={ship.name}
                              type='button'
                              onClick={() => !isPlaced && setSelectedShip(ship)}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-all ${
                                isPlaced
                                  ? 'border-teal-500/30 bg-teal-500/10 opacity-60 cursor-default'
                                  : isSelected
                                    ? 'border-teal-400 bg-teal-500/20 shadow-lg shadow-teal-500/10'
                                    : 'border-slate-600/40 bg-slate-700/20 hover:border-teal-500/40 cursor-pointer'
                              }`}
                            >
                              <div className='flex flex-col gap-0.5'>
                                <span className='text-xs font-black'>
                                  {ship.name}
                                </span>
                                <span className='text-[10px] text-muted-foreground'>
                                  {ship.size} cells
                                </span>
                              </div>
                              <div className='ml-2'>
                                {isPlaced ? (
                                  <span className='text-[10px] font-black text-teal-400'>
                                    ✓
                                  </span>
                                ) : (
                                  <ShipVisual size={ship.size} />
                                )}
                              </div>
                            </button>
                          )
                        })}

                        <div className='flex flex-col gap-2 mt-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            className='border-teal-500/30 text-teal-400 hover:bg-teal-500/10 gap-2'
                            onClick={() => setHorizontal(h => !h)}
                          >
                            <RotateCcw className='h-3 w-3' />
                            {horizontal ? 'Horizontal' : 'Vertical'}
                            <span className='text-[9px] text-muted-foreground ml-1'>
                              [R]
                            </span>
                          </Button>

                          {placedShips.length > 0 && (
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='text-muted-foreground hover:text-destructive text-[10px]'
                              onClick={() => {
                                setPlacedShips([])
                                setSelectedShip(FLEET[0])
                              }}
                            >
                              Reset placement
                            </Button>
                          )}

                          <Button
                            type='button'
                            size='sm'
                            className='bg-teal-600 hover:bg-teal-700 font-black uppercase text-xs'
                            disabled={placedShips.length !== FLEET.length}
                            onClick={submitFleet}
                          >
                            Ready!
                          </Button>
                        </div>
                      </div>

                      {/* Placement grid */}
                      <div className='flex-1'>
                        <p className='text-[9px] font-black uppercase tracking-[0.2em] text-teal-400/70 mb-1'>
                          {selectedShip
                            ? `Placing: ${selectedShip.name} (${selectedShip.size} cells)`
                            : 'All ships placed — click Ready!'}
                        </p>
                        <div className='rounded-xl border-2 border-teal-700/60 bg-teal-950/40 p-1.5'>
                          <div
                            className='grid gap-0.5'
                            style={{
                              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                            }}
                          >
                            {Array.from({ length: GRID_SIZE }).map((_, row) =>
                              Array.from({ length: GRID_SIZE }).map(
                                (_, col) => {
                                  const key = `${row},${col}`
                                  const isOccupied = myShipCells.has(key)
                                  const isPreview = previewCells.has(key)

                                  let cellClass =
                                    'bg-slate-700/30 border-slate-600/30 hover:bg-teal-500/20 hover:border-teal-500/40 cursor-crosshair'
                                  if (isOccupied) {
                                    cellClass =
                                      'bg-teal-700/60 border-teal-600/60 cursor-pointer'
                                  } else if (isPreview) {
                                    cellClass = previewValid
                                      ? 'bg-teal-500/40 border-teal-400 cursor-crosshair'
                                      : 'bg-red-500/40 border-red-400 cursor-not-allowed'
                                  }

                                  return (
                                    <button
                                      type='button'
                                      key={key}
                                      onClick={() =>
                                        handleSetupCellClick(row, col)
                                      }
                                      onMouseEnter={() =>
                                        selectedShip && setHoverCell([row, col])
                                      }
                                      onMouseLeave={() => setHoverCell(null)}
                                      className={`relative aspect-square w-full rounded-sm border transition-colors duration-100 ${cellClass}`}
                                    />
                                  )
                                }
                              )
                            )}
                          </div>
                        </div>
                        <div className='flex gap-0.5 mt-0.5 px-1.5'>
                          {COLUMN_LABELS.map(label => (
                            <div
                              key={label}
                              className='flex-1 text-center text-[8px] text-slate-500 font-mono'
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Battle Phase */}
              {coreState.status === 'active' && isBattlePhase && isPlayer && (
                <div className='w-full max-w-3xl'>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    <BoardGrid
                      label='Your Waters'
                      myBoard={true}
                      defenseShips={myDefenseShips}
                      incomingShots={incomingShotsSet}
                      myShots={myShotsSet}
                      opponentShipCells={new Set()}
                      sunkCells={new Set()}
                      isMyTurn={isMyTurn}
                      gameActive={coreState.status === 'active'}
                    />
                    <BoardGrid
                      label='Enemy Waters'
                      myBoard={false}
                      defenseShips={[]}
                      incomingShots={new Set()}
                      myShots={myShotsSet}
                      opponentShipCells={opponentShipCellSet}
                      sunkCells={sunkOpponentCells}
                      isMyTurn={isMyTurn}
                      gameActive={coreState.status === 'active'}
                      onCellClick={makeShot}
                      onCellHover={(r, c) => setHoverCell([r, c])}
                      onCellLeave={() => setHoverCell(null)}
                      hoverCell={hoverCell}
                    />
                  </div>

                  {/* Sunk ships tracker */}
                  {opponentShipsList.length > 0 && (
                    <div className='mt-3 flex flex-wrap gap-2 justify-center'>
                      {opponentShipsList.map(ship => {
                        const sunk = isShipFullySunk(ship, myShotsSet)
                        return (
                          <span
                            key={ship.name}
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                              sunk
                                ? 'border-orange-500/50 bg-orange-500/10 text-orange-400 line-through'
                                : 'border-slate-600/30 bg-slate-700/20 text-slate-500'
                            }`}
                          >
                            {ship.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Observer */}
              {coreState.status === 'active' && !isPlayer && !canJoin && (
                <div className='text-center text-muted-foreground'>
                  <p className='font-medium'>Match in progress</p>
                </div>
              )}

              {/* Game Over */}
              {coreState.status === 'finished' && (
                <div className='mt-2 flex flex-col items-center'>
                  <div className='mb-4 text-center'>
                    <h3 className='mb-1 text-xl font-black italic uppercase text-teal-400'>
                      Battle Over
                    </h3>
                    <p className='text-muted-foreground font-bold'>
                      The seas have spoken.
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    className='border-teal-500/20 px-8 hover:bg-teal-500/5'
                    onClick={() => navigate('/games')}
                  >
                    Return to Lobby
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat sidebar */}
        <div className='flex min-h-0 flex-col lg:col-span-3'>
          <Card className='flex h-full min-h-0 flex-col overflow-hidden border-2 bg-card/50 backdrop-blur-sm'>
            <GameChat
              messages={messages}
              currentUserId={currentUserId}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSend={sendChat}
              accentColor='teal'
              placeholder='Talk some trash...'
              chatScrollRef={chatScrollRef}
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
        accentColor='teal'
        showIcon
        descriptions={{
          win: 'Enemy fleet destroyed. Run it back?',
          lose: 'Your fleet was sunk. Seek revenge?',
          draw: 'Draw game. Run it back?',
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
