import { PartyPopper } from 'lucide-react'
import { useMemo } from 'react'
import {
  createConfettiPieces,
  createDefeatPieces,
  DEFAULT_CONFETTI_COLORS,
  DEFAULT_DEFEAT_COLORS,
} from '@/lib/game-effects'

interface GameResultOverlayProps {
  show: 'victory' | 'defeat' | null
  confettiColors?: readonly string[]
  defeatColors?: readonly string[]
}

export function GameResultOverlay({
  show,
  confettiColors = DEFAULT_CONFETTI_COLORS,
  defeatColors = DEFAULT_DEFEAT_COLORS,
}: GameResultOverlayProps) {
  const confettiPieces = useMemo(
    () => createConfettiPieces(confettiColors),
    [confettiColors]
  )
  const defeatPieces = useMemo(
    () => createDefeatPieces(defeatColors),
    [defeatColors]
  )

  if (show === null) {
    return null
  }

  if (show === 'victory') {
    return (
      <div className='pointer-events-none fixed inset-0 z-40 overflow-hidden'>
        <style>
          {`@keyframes confetti-drop { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(120vh) rotate(720deg); opacity: 0.2; } }`}
        </style>
        <div className='absolute inset-0 animate-pulse bg-linear-to-b from-fuchsia-500/20 via-yellow-400/10 to-transparent' />
        {confettiPieces.map(piece => (
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
    )
  }

  return (
    <div className='pointer-events-none fixed inset-0 z-40 overflow-hidden'>
      <style>
        {`@keyframes defeat-drop { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 0.85; } 100% { transform: translateY(120vh) rotate(360deg); opacity: 0.08; } }`}
      </style>
      <div className='absolute inset-0 bg-linear-to-b from-slate-950/80 via-slate-900/60 to-black/70' />
      {defeatPieces.map(piece => (
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
  )
}
