// Shared hook for user interaction actions — used by UserMenu and UserContextMenu

import { useNavigate } from 'react-router-dom'
import type { User } from '@/api/types'
import { useCreateConversation } from '@/hooks/useChat'
import { useFriendshipStatus, useRemoveFriend, useSendFriendRequest } from '@/hooks/useFriends'
import { getCurrentUser } from '@/hooks/useUsers'

export function useUserActions(user: User) {
    const navigate = useNavigate()
    const currentUser = getCurrentUser()
    const { data: statusData, isLoading } = useFriendshipStatus(user.id)
    const sendRequest = useSendFriendRequest()
    const removeFriend = useRemoveFriend()
    const createConversation = useCreateConversation()

    const isSelf = currentUser != null && currentUser.id === user.id
    const status = statusData?.status || 'none'

    const handleViewProfile = () => {
        navigate(`/users/${user.id}`)
    }

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

    const handleVideoChat = () => {
        const ids = [currentUser?.id ?? 0, user.id].sort((a, b) => a - b)
        const roomId = `vc-${ids[0]}-${ids[1]}`
        navigate(`/videochat?room=${encodeURIComponent(roomId)}`)
    }

    const handleAddFriend = () => {
        sendRequest.mutate(user.id)
    }

    const handleRemoveFriend = () => {
        removeFriend.mutate(user.id)
    }

    const canAddFriend =
        status === 'none' || status === 'pending_sent' || status === 'pending_received'
    const addFriendDisabled = sendRequest.isPending || isLoading || status === 'pending_sent'
    const addFriendLabel = status === 'pending_sent' ? 'Request Sent' : 'Add Friend'
    const isFriend = status === 'friends'
    const removeFriendPending = removeFriend.isPending

    return {
        isSelf,
        status,
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
    }
}
