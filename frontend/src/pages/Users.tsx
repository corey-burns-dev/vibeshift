import { useQuery } from '@tanstack/react-query'
import { Loader2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiClient } from '@/api/client'
import type { User } from '@/api/types'
import { type FriendAction, FriendCard } from '@/components/friends/FriendCard'
import { FriendSidebar } from '@/components/friends/FriendSidebar'
import {
  useAcceptFriendRequest,
  useFriends,
  usePendingRequests,
  useRejectFriendRequest,
  useRemoveFriend,
  useSendFriendRequest,
  useSentRequests,
} from '@/hooks/useFriends'
import { getCurrentUser } from '@/hooks/useUsers'

type ViewType = 'suggestions' | 'requests' | 'friends'

export default function Users() {
  const [activeView, setActiveView] = useState<ViewType>('suggestions')
  const currentUser = getCurrentUser()

  // Data Fetching
  const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers({ limit: 100 }),
  })

  const { data: friends = [], isLoading: isLoadingFriends } = useFriends()
  const { data: incomingRequests = [], isLoading: isLoadingIncoming } =
    usePendingRequests()
  const { data: outgoingRequests = [], isLoading: isLoadingOutgoing } =
    useSentRequests()

  // Mutations
  const sendRequestMutation = useSendFriendRequest()
  const acceptRequestMutation = useAcceptFriendRequest()
  const rejectRequestMutation = useRejectFriendRequest()
  const removeFriendMutation = useRemoveFriend()

  const suggestions = useMemo(() => {
    if (!currentUser) return []

    const friendIds = new Set(friends.map(f => f.id))
    const incomingIds = new Set(incomingRequests.map(r => r.sender_id))
    const outgoingIds = new Set(outgoingRequests.map(r => r.receiver_id))

    return allUsers.filter(
      user =>
        user.id !== currentUser.id &&
        !friendIds.has(user.id) &&
        !incomingIds.has(user.id) &&
        !outgoingIds.has(user.id)
    )
  }, [allUsers, friends, incomingRequests, outgoingRequests, currentUser])

  const requestsList = useMemo(() => {
    // We might want to show both incoming and outgoing here?
    // Facebook "Friend Requests" usually means incoming.
    // Outgoing are usually hidden or in a "View Sent Requests" sub-menu.
    // For simplicity, let's show Incoming Requests here.
    return incomingRequests
  }, [incomingRequests])

  // Handling Actions
  const handleAction = (action: FriendAction, user: User) => {
    switch (action) {
      case 'add':
        sendRequestMutation.mutate(user.id)
        break
      case 'accept': {
        // Find request ID
        const reqToAccept = incomingRequests.find(r => r.sender_id === user.id)
        if (reqToAccept) acceptRequestMutation.mutate(reqToAccept.id)
        break
      }
      case 'reject': {
        const reqToReject = incomingRequests.find(r => r.sender_id === user.id)
        if (reqToReject) rejectRequestMutation.mutate(reqToReject.id)
        break
      }
      case 'remove':
        removeFriendMutation.mutate(user.id)
        break
      case 'cancel':
        // Assuming removeFriend handles cancelling sent requests by userID
        // If not, we might need to implement a specific endpoint.
        // Given the constraints, I will try removeFriend.
        removeFriendMutation.mutate(user.id)
        break
    }
  }

  const isLoading =
    isLoadingUsers || isLoadingFriends || isLoadingIncoming || isLoadingOutgoing

  return (
    <div className='flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-[#F0F2F5] overflow-hidden'>
      <FriendSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        requestCount={incomingRequests.length}
      />

      <div className='flex-1 overflow-y-auto p-4 md:p-8'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold mb-2 capitalize'>
            {activeView === 'requests'
              ? 'Friend Requests'
              : activeView === 'friends'
                ? 'All Friends'
                : 'People You May Know'}
          </h1>
          {activeView === 'requests' && requestsList.length > 0 && (
            <p className='text-red-500 font-medium text-sm'>
              {requestsList.length} Friend Request
              {requestsList.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4'>
            {activeView === 'suggestions' &&
              suggestions.map(user => (
                <FriendCard
                  key={user.id}
                  user={user}
                  actionType='add'
                  onAction={handleAction}
                />
              ))}

            {activeView === 'requests' &&
              requestsList.map(req =>
                req.sender ? (
                  <FriendCard
                    key={req.id}
                    user={req.sender}
                    actionType='accept_reject'
                    onAction={handleAction}
                  />
                ) : null
              )}

            {activeView === 'requests' && requestsList.length === 0 && (
              <div className='col-span-full text-center py-12'>
                <UsersIcon className='w-16 h-16 mx-auto text-muted-foreground/30 mb-4' />
                <p className='text-muted-foreground font-medium'>
                  No new friend requests
                </p>
              </div>
            )}

            {activeView === 'friends' &&
              friends.map(user => (
                <FriendCard
                  key={user.id}
                  user={user}
                  actionType='remove'
                  onAction={handleAction}
                />
              ))}

            {activeView === 'friends' && friends.length === 0 && (
              <div className='col-span-full text-center py-12'>
                <UserPlus className='w-16 h-16 mx-auto text-muted-foreground/30 mb-4' />
                <p className='text-muted-foreground font-medium'>
                  No friends yet. Go to Suggestions to add some!
                </p>
              </div>
            )}

            {activeView === 'suggestions' && suggestions.length === 0 && (
              <div className='col-span-full text-center py-12 text-muted-foreground'>
                No suggestions available.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
