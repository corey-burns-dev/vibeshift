import { useState } from 'react'
import { FriendList } from '@/components/friends/FriendList'
import { FriendRequestList } from '@/components/friends/FriendRequests'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFriends, usePendingRequests } from '@/hooks/useFriends'

export default function Friends() {
  const [activeTab, setActiveTab] = useState('friends')
  const { data: pendingRequests } = usePendingRequests()
  const { data: friends } = useFriends()

  return (
    <div className='flex-1 overflow-y-auto px-4 py-8 text-foreground'>
      <div className='max-w-4xl mx-auto'>
        <div className='mb-8'>
          <h1 className='text-3xl font-bold mb-2'>Friends</h1>
          <p className='text-muted-foreground'>
            Connect with people and build your network
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='friends'>
              Friends{' '}
              {friends && friends.length > 0 ? `(${friends.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value='requests'>
              Requests{' '}
              {pendingRequests && pendingRequests.length > 0
                ? `(${pendingRequests.length})`
                : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='friends' className='mt-6'>
            <FriendList />
          </TabsContent>

          <TabsContent value='requests' className='mt-6'>
            <FriendRequestList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
