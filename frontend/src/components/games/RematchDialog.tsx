import { PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RematchDescriptions {
  win?: string
  lose?: string
  draw?: string
}

interface RematchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isWin: boolean
  isDraw: boolean
  isStartingRematch: boolean
  onPlayAgain: () => void
  onLobby: () => void
  accentColor?: 'blue' | 'emerald'
  showIcon?: boolean
  descriptions?: RematchDescriptions
}

const ACCENT_STYLES = {
  blue: {
    content:
      'border-2 border-blue-400/30 bg-linear-to-br from-background to-blue-950/20',
    title: 'text-blue-500',
    outline: 'border-blue-500/20 hover:bg-blue-500/5',
  },
  emerald: {
    content:
      'border-2 border-emerald-400/30 bg-linear-to-br from-background to-emerald-950/20',
    title: 'text-emerald-500',
    outline: 'border-emerald-500/30 hover:bg-emerald-500/10',
  },
} as const

export function RematchDialog({
  open,
  onOpenChange,
  isWin,
  isDraw,
  isStartingRematch,
  onPlayAgain,
  onLobby,
  accentColor = 'blue',
  showIcon = false,
  descriptions,
}: RematchDialogProps) {
  const accent = ACCENT_STYLES[accentColor]

  const description = isDraw
    ? (descriptions?.draw ?? 'Draw game. Run it back?')
    : isWin
      ? (descriptions?.win ?? 'Want to play again?')
      : (descriptions?.lose ?? 'Play another round and settle the score?')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${accent.content} sm:max-w-xl`}>
        <DialogHeader>
          <DialogTitle
            className={`flex items-center gap-2 text-2xl font-black uppercase ${accent.title}`}
          >
            {showIcon && <PartyPopper className='h-6 w-6' />}
            {isWin ? 'Victory!' : 'Round Complete'}
          </DialogTitle>
          <DialogDescription className='text-sm font-medium'>
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant='outline'
            className={accent.outline}
            onClick={onLobby}
          >
            Back to Lobby
          </Button>
          <Button onClick={onPlayAgain} disabled={isStartingRematch}>
            {isStartingRematch ? 'Starting...' : 'Play Again'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
