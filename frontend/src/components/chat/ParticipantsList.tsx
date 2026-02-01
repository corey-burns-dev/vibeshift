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
        <div className="space-y-6">
            {/* Online Users */}
            <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">
                    Online — {onlineParticipants.length}
                </h4>
                {onlineParticipants.length > 0 ? (
                    <div className="space-y-1">
                        {onlineParticipants.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                                <div className="relative">
                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                    {user.typing && (
                                        <div className="absolute -inset-1 bg-primary/20 rounded-full animate-ping" />
                                    )}
                                </div>
                                <span className="truncate font-medium">{user.username}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[10px] text-muted-foreground italic px-2">
                        No one is online
                    </p>
                )}
            </div>

            {/* Offline Users */}
            <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">
                    Offline — {offlineParticipants.length}
                </h4>
                <div className="space-y-1">
                    {offlineParticipants.map((user) => (
                        <div
                            key={user.id}
                            className="flex items-center gap-2 text-xs p-2 rounded-lg opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all"
                        >
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                            <span className="truncate">{user.username}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
})
