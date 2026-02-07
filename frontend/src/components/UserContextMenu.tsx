import { MessageCircle, User as UserIcon, UserMinus, UserPlus, Video } from 'lucide-react'
import type { User } from '@/api/types'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useUserActions } from '@/hooks/useUserActions'

interface UserContextMenuProps {
    user: User
    children: React.ReactNode
}

export function UserContextMenu({ user, children }: UserContextMenuProps) {
    const {
        isSelf,
        handleViewProfile,
        handleMessage,
        handleVideoChat,
        handleAddFriend,
        handleRemoveFriend,
        canAddFriend,
        addFriendDisabled,
        addFriendLabel,
        isFriend,
        removeFriendPending,
    } = useUserActions(user)

    if (isSelf) {
        return <>{children}</>
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                <ContextMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.username}</p>
                        {user.bio && (
                            <p className="text-xs text-muted-foreground truncate">{user.bio}</p>
                        )}
                    </div>
                </ContextMenuLabel>
                <ContextMenuSeparator />

                <ContextMenuItem onClick={handleViewProfile}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>View Profile</span>
                </ContextMenuItem>

                <ContextMenuItem onClick={handleMessage}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    <span>Message</span>
                </ContextMenuItem>

                <ContextMenuItem onClick={handleVideoChat}>
                    <Video className="mr-2 h-4 w-4" />
                    <span>Video Chat</span>
                </ContextMenuItem>

                <ContextMenuSeparator />

                {canAddFriend && (
                    <ContextMenuItem onClick={handleAddFriend} disabled={addFriendDisabled}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>{addFriendLabel}</span>
                    </ContextMenuItem>
                )}

                {isFriend && (
                    <ContextMenuItem
                        onClick={handleRemoveFriend}
                        className="text-destructive focus:text-destructive"
                        disabled={removeFriendPending}
                    >
                        <UserMinus className="mr-2 h-4 w-4" />
                        <span>Remove Friend</span>
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}
