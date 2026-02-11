import { memo } from 'react'

interface Participant {
  id: number
  username?: string
  online?: boolean
  typing?: boolean
}

interface ParticipantsListProps {
  participants: Record<number, Participant>
  onlineUserIds: Set<number>
}

export const ParticipantsList = memo(function ParticipantsList({
  participants,
  onlineUserIds,
}: ParticipantsListProps) {
  const onlineParticipants = Object.values(participants)
    .filter(p => p.online || onlineUserIds.has(p.id))
    .sort((a, b) => {
      // Alphabetical
      return (a.username || '').localeCompare(b.username || '')
    })

  return (
    <div className='space-y-2'>
      <h4 className='px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground'>
        Online Members - {onlineParticipants.length}
      </h4>
      {onlineParticipants.length > 0 ? (
        <div className='space-y-1'>
          {onlineParticipants.map(user => (
            <div
              key={user.id}
              className='flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/50'
            >
              <div className='relative'>
                <div className='h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' />
                {user.typing && (
                  <div className='absolute -inset-1 animate-ping rounded-full bg-primary/20' />
                )}
              </div>
              <span className='truncate font-medium'>
                {user.username || `User ${user.id}`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className='px-2 text-[10px] italic text-muted-foreground'>
          No one joined yet.
        </p>
      )}
    </div>
  )
})
