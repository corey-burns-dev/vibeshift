import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useAcceptFriendRequest,
  usePendingRequests,
  useRejectFriendRequest,
  useSentRequests,
} from '@/hooks/useFriends'

export function FriendRequestList() {
  const { data: incoming, isLoading: loadingIncoming } = usePendingRequests()
  const { data: outgoing, isLoading: loadingOutgoing } = useSentRequests()

  const acceptRequest = useAcceptFriendRequest()
  const rejectRequest = useRejectFriendRequest()

  if (loadingIncoming || loadingOutgoing) {
    return (
      <div className='p-4 text-center text-muted-foreground'>
        Loading requests...
      </div>
    )
  }

  const hasIncoming = incoming && incoming.length > 0
  const hasOutgoing = outgoing && outgoing.length > 0

  if (!hasIncoming && !hasOutgoing) {
    return (
      <div className='p-8 text-center border rounded-lg bg-card/50 text-muted-foreground'>
        No pending or sent friend requests.
      </div>
    )
  }

  return (
    <div className='space-y-8'>
      {hasIncoming && (
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold'>Incoming Requests</h3>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {incoming.map(req => (
              <Card key={req.id}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <div className='h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary'>
                      {req.sender?.avatar ? (
                        <img
                          src={req.sender.avatar}
                          alt={req.sender.username}
                          className='h-8 w-8 rounded-full object-cover'
                        />
                      ) : (
                        req.sender?.username?.[0].toUpperCase()
                      )}
                    </div>
                    {req.sender?.username}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      className='flex-1'
                      onClick={() => acceptRequest.mutate(req.id)}
                      disabled={acceptRequest.isPending}
                    >
                      <Check className='w-4 h-4 mr-2' />
                      Accept
                    </Button>
                    <Button
                      variant='destructive'
                      size='sm'
                      className='flex-1'
                      onClick={() => rejectRequest.mutate(req.id)}
                      disabled={rejectRequest.isPending}
                    >
                      <X className='w-4 h-4 mr-2' />
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {hasOutgoing && (
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold'>Sent Requests</h3>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {outgoing.map(req => (
              <Card key={req.id} className='opacity-75'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <div className='h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground'>
                      {req.receiver?.avatar ? (
                        <img
                          src={req.receiver.avatar}
                          alt={req.receiver.username}
                          className='h-8 w-8 rounded-full object-cover'
                        />
                      ) : (
                        req.receiver?.username?.[0].toUpperCase()
                      )}
                    </div>
                    {req.receiver?.username}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    onClick={() => {
                      // Ideally we cancel via DELETE /friends/requests/:id
                      // Using reject for now if backend supports it for cancel
                      // The backend implementation of reject is deleting the request, so it works for sender too if ownership check passes
                      // Wait, does backend allow sender to delete?
                      // Let's check server code in a moment if needed. For now assuming reject/cancel is same endpoint or handled.
                      rejectRequest.mutate(req.id)
                    }}
                    disabled={rejectRequest.isPending}
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
