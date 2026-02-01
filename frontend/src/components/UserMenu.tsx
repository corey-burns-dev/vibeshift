import { MessageCircle, User as UserIcon, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/api/types'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCreateConversation } from '@/hooks/useChat'
import {
    useAcceptFriendRequest,
    useFriendshipStatus,
    useRemoveFriend,
    useSendFriendRequest,
} from '@/hooks/useFriends'
import { getCurrentUser } from '@/hooks/useUsers'

interface UserMenuProps {
    user: User
    children: React.ReactNode
}

export function UserMenu({ user, children }: UserMenuProps) {
    const navigate = useNavigate()
    const currentUser = getCurrentUser()
    const { data: statusData, isLoading } = useFriendshipStatus(user.id)
    const sendRequest = useSendFriendRequest()
    const acceptRequest = useAcceptFriendRequest()
    const _rejectRequest = useState(null) // Not exposed in simplified menu
    const removeFriend = useRemoveFriend()
    const createConversation = useCreateConversation()

    const isSelf = currentUser && currentUser.id === user.id
    const status = statusData?.status || 'none'
    const requestId = statusData?.request_id

    const handleMessage = () => {
        createConversation.mutate(
            { participant_ids: [user.id] },
            {
                onSuccess: (conv) => {
                    navigate(`/messages/${conv.id}`)
                },
            }
        )
    }

    if (isSelf) {
        return <>{children}</>
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild className="cursor-pointer">
                {children}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.username}</p>
                        {user.bio && (
                            <p className="text-xs text-muted-foreground truncate">{user.bio}</p>
                        )}
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>View Profile</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleMessage}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    <span>Message</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {status === 'none' && (
                    <DropdownMenuItem
                        onClick={() => sendRequest.mutate(user.id)}
                        disabled={sendRequest.isPending || isLoading}
                    >
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>Add Friend</span>
                    </DropdownMenuItem>
                )}

                {status === 'pending_sent' && (
                    <DropdownMenuItem disabled>
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>Request Sent</span>
                    </DropdownMenuItem>
                )}

                {status === 'pending_received' && requestId && (
                    <DropdownMenuItem
                        onClick={() => acceptRequest.mutate(requestId)}
                        disabled={acceptRequest.isPending}
                    >
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>Accept Request</span>
                    </DropdownMenuItem>
                )}

                {status === 'friends' && (
                    <DropdownMenuItem
                        onClick={() => {
                            if (confirm(`Remove ${user.username} from friends?`)) {
                                removeFriend.mutate(user.id)
                            }
                        }}
                        className="text-destructive focus:text-destructive"
                        disabled={removeFriend.isPending}
                    >
                        <UserMinus className="mr-2 h-4 w-4" />
                        <span>Remove Friend</span>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
