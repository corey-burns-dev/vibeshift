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
import {
  useBlockUser,
  useMyBlocks,
  useReportUser,
  useUnblockUser,
} from '@/hooks/useModeration'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'

export function useUserActions(user: User) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const isAuthenticated = useIsAuthenticated()
  const { data: statusData, isLoading } = useFriendshipStatus(user.id, {
    enabled: isAuthenticated,
  })
  const sendRequest = useSendFriendRequest()
  const removeFriend = useRemoveFriend()
  const createConversation = useCreateConversation()
  const { data: myBlocks = [] } = useMyBlocks({ enabled: isAuthenticated })
  const blockUser = useBlockUser()
  const unblockUser = useUnblockUser()
  const reportUser = useReportUser()
  const onlineUserIDs = usePresenceStore(state => state.onlineUserIds)
  const isUserOnline = (userID: number) => onlineUserIDs.has(userID)

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
          navigate(`/chat/${conv.id}`)
        },
      }
    )
  }

  const handleJoinConnect4 = async () => {
    if (!isUserOnline(user.id)) {
      toast.error('User is offline and cannot be invited right now')
      return
    }
    try {
      const freshRooms = await apiClient.getActiveGameRooms('connect4')
      const openRoom = freshRooms.find(
        room =>
          room.status === 'pending' &&
          room.creator_id &&
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

  const isBlocked = myBlocks.some(block => block.blocked_id === user.id)
  const targetOnline = isUserOnline(user.id)
  const toggleBlockUser = () => {
    if (isBlocked) {
      unblockUser.mutate(user.id, {
        onSuccess: () => toast.success('User unblocked'),
        onError: () => toast.error('Failed to unblock user'),
      })
      return
    }
    blockUser.mutate(user.id, {
      onSuccess: () => toast.success('User blocked'),
      onError: () => toast.error('Failed to block user'),
    })
  }

  const handleReportUser = () => {
    const reason = window.prompt('Reason for reporting this user?')?.trim()
    if (!reason) return
    const details = window.prompt('Additional details (optional)')?.trim()
    reportUser.mutate(
      {
        userId: user.id,
        payload: { reason, details },
      },
      {
        onSuccess: () => toast.success('User reported'),
        onError: () => toast.error('Failed to report user'),
      }
    )
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
    handleJoinConnect4,
    targetOnline,
    handleAddFriend,
    handleRemoveFriend,
    canAddFriend,
    addFriendDisabled,
    addFriendLabel,
    isFriend,
    removeFriendPending,
    isBlocked,
    toggleBlockUser,
    handleReportUser,
    blockPending: blockUser.isPending || unblockUser.isPending,
  }
}
