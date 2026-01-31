import { memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

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
    const sortedParticipants = Object.values(participants).sort((a, b) => {
        // Online users first
        const aOnline = a.online || onlineUserIds.has(a.id)
        const bOnline = b.online || onlineUserIds.has(b.id)
        if (aOnline && !bOnline) return -1
        if (!aOnline && bOnline) return 1
        // Then alphabetical
        return (a.username || '').localeCompare(b.username || '')
    })

    return (
        <div className="w-[15%] border-l bg-card flex flex-col overflow-hidden">
            <div className="p-4 border-b shrink-0">
                <h3 className="font-semibold text-sm">Participants</h3>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {sortedParticipants.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                            No participants
                        </div>
                    ) : (
                        sortedParticipants.map((user) => {
                            const isOnline = user.online || onlineUserIds.has(user.id)
                            return (
                                <div
                                    key={user.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
                                >
                                    <div className="relative">
                                        <Avatar className="w-6 h-6">
                                            <AvatarImage
                                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                                            />
                                            <AvatarFallback className="text-[10px]">
                                                {user.username?.[0]?.toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        {isOnline && (
                                            <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-background" />
                                        )}
                                    </div>
                                    <span className="text-xs font-medium truncate flex-1">
                                        {user.username || 'Unknown'}
                                    </span>
                                </div>
                            )
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    )
})
