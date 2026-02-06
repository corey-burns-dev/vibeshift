import { memo } from 'react'
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const USER_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12', '#9b59b6', '#e74c3c', '#3498db']

const getUserColor = (userId: number) => {
    return USER_COLORS[userId % USER_COLORS.length]
}

const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    })
}

import type { Message } from '@/api/types'

interface MessageListProps {
    messages: Message[]
    isLoading: boolean
    currentUserId?: number
}

export const MessageList = memo(function MessageList({
    messages,
    isLoading,
    currentUserId,
}: MessageListProps) {
    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Loading messages...
            </div>
        )
    }

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                No messages yet. Start the conversation!
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {messages.map((msg) => {
                const isOwnMessage = msg.sender_id === currentUserId
                const sender = msg.sender

                return (
                    <div key={msg.id} className="flex items-start gap-2.5 group">
                        {sender ? (
                            <UserMenu user={sender}>
                                <Avatar className="w-7 h-7 shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity">
                                    <AvatarImage
                                        src={
                                            sender.avatar ||
                                            `https://i.pravatar.cc/150?u=${sender.username}`
                                        }
                                    />
                                    <AvatarFallback className="text-[10px]">
                                        {sender.username?.[0]?.toUpperCase() || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                            </UserMenu>
                        ) : (
                            <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                                <AvatarImage src={`https://i.pravatar.cc/150?u=unknown`} />
                                <AvatarFallback className="text-[10px]">U</AvatarFallback>
                            </Avatar>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                                {sender ? (
                                    <UserMenu user={sender}>
                                        <span
                                            className="font-semibold text-[13px] cursor-pointer hover:underline"
                                            style={{
                                                color: getUserColor(msg.sender_id),
                                            }}
                                        >
                                            {isOwnMessage ? 'You' : sender.username}
                                        </span>
                                    </UserMenu>
                                ) : (
                                    <span
                                        className="font-semibold text-[13px]"
                                        style={{
                                            color: getUserColor(msg.sender_id),
                                        }}
                                    >
                                        Unknown
                                    </span>
                                )}
                                <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                    {formatTimestamp(msg.created_at)}
                                </span>
                            </div>
                            <p className="text-[13px] leading-snug whitespace-pre-wrap wrap-break-word text-foreground/90">
                                {msg.content}
                            </p>
                        </div>
                    </div>
                )
            })}
        </div>
    )
})
