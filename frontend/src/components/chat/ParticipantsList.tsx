import { memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

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

    const onlineParticipants = sortedParticipants.filter((p) => p.online || onlineUserIds.has(p.id))
    const offlineParticipants = sortedParticipants.filter(
        (p) => !(p.online || onlineUserIds.has(p.id))
    )

    return (
        <div className="w-[15%] border-l bg-card flex flex-col overflow-hidden">
            <div className="p-4 border-b shrink-0">
                <h3 className="font-semibold text-sm">Participants</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
                <div className="space-y-4 p-4">
                    {/* Online Users */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Online - {onlineParticipants.length}
                        </h4>
                        {onlineParticipants.length > 0 ? (
                            onlineParticipants.map((user) => (
                                <div key={user.id} className="flex items-center gap-2 text-sm">
                                    <div className="relative">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        {user.typing && (
                                            <div className="absolute -right-1 -top-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
                                        )}
                                    </div>
                                    <span className="truncate flex-1">{user.username}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground italic">No one is online</p>
                        )}
                    </div>

                    {/* Offline Users */}
                    <div className="space-y-2 pt-4 border-t">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Offline - {offlineParticipants.length}
                        </h4>
                        {offlineParticipants.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center gap-2 text-sm opacity-50"
                            >
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                                <span className="truncate flex-1">{user.username}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
})
