import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface LeaveGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isLeaving: boolean
  onLeave: () => void
}

export function LeaveGameDialog({
  open,
  onOpenChange,
  isLeaving,
  onLeave,
}: LeaveGameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle className='text-lg font-black uppercase'>
            Leave Game?
          </DialogTitle>
          <DialogDescription className='text-sm font-medium'>
            Leaving an active game counts as a forfeit. Are you sure?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isLeaving}
          >
            Stay
          </Button>
          <Button variant='destructive' onClick={onLeave} disabled={isLeaving}>
            {isLeaving ? 'Leaving...' : 'Leave Game'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
