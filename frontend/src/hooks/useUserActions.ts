// Shared hook for user interaction actions — used by UserMenu and UserContextMenu

import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import type { User } from '@/api/types'
import { useCreateConversation } from '@/hooks/useChat'
import {
  useFriendshipStatus,
  useRemoveFriend,
  useSendFriendRequest,
} from '@/hooks/useFriends'
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
        onSuccess: conv => {
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

  const handleJoinConnect4 = async () => {
    try {
      const freshRooms = await apiClient.getActiveGameRooms('connect4')
      const openRoom = freshRooms.find(
        room =>
          room.status === 'pending' &&
          room.creator_id !== currentUser?.id &&
          !room.opponent_id
      )

      if (openRoom) {
        navigate(`/games/connect4/${openRoom.id}`)
        return
      }

      const myPendingRoom = freshRooms.find(
        room => room.status === 'pending' && room.creator_id === currentUser?.id
      )
      if (myPendingRoom) {
        navigate(`/games/connect4/${myPendingRoom.id}`)
        return
      }

      const room = await apiClient.createGameRoom('connect4')
      navigate(`/games/connect4/${room.id}`)
    } catch (error) {
      console.error('Failed to join or create Connect 4 game', error)
      toast.error('Could not open Connect 4 right now')
    }
  }

  const handleAddFriend = () => {
    sendRequest.mutate(user.id)
  }

  const handleRemoveFriend = () => {
    removeFriend.mutate(user.id)
  }

  const canAddFriend = status === 'none' || status === 'pending_sent'
  const addFriendDisabled =
    sendRequest.isPending ||
    isLoading ||
    status === 'pending_sent' ||
    status === 'pending_received'
  const addFriendLabel =
    status === 'pending_sent' || status === 'pending_received'
      ? 'Request Sent'
      : 'Add Friend'
  const isFriend = status === 'friends'
  const removeFriendPending = removeFriend.isPending

  return {
    isSelf,
    status,
    handleViewProfile,
    handleMessage,
    handleVideoChat,
    handleJoinConnect4,
    handleAddFriend,
    handleRemoveFriend,
    canAddFriend,
    addFriendDisabled,
    addFriendLabel,
    isFriend,
    removeFriendPending,
  }
}
