import { MessageCircle, MoreHorizontal, Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Mock friends data
const friends = [
  {
    id: 1,
    name: 'Alice Johnson',
    username: 'alice_dev',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    status: 'online',
    lastSeen: 'now',
    mutualFriends: 12,
  },
  {
    id: 2,
    name: 'Bob Smith',
    username: 'bob_coder',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    status: 'online',
    lastSeen: 'now',
    mutualFriends: 8,
  },
  {
    id: 3,
    name: 'Charlie Brown',
    username: 'charlie_ui',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
    status: 'away',
    lastSeen: '2h ago',
    mutualFriends: 15,
  },
]

// Mock friend requests
const friendRequests = [
  {
    id: 4,
    name: 'Diana Prince',
    username: 'diana_design',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
    mutualFriends: 5,
  },
  {
    id: 5,
    name: 'Eve Wilson',
    username: 'eve_writer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=eve',
    mutualFriends: 3,
  },
]

// Mock suggested friends
const suggestedFriends = [
  {
    id: 6,
    name: 'Frank Miller',
    username: 'frank_artist',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=frank',
    mutualFriends: 7,
    reason: 'Works at the same company',
  },
  {
    id: 7,
    name: 'Grace Lee',
    username: 'grace_photographer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=grace',
    mutualFriends: 4,
    reason: 'Followed by 3 friends',
  },
]

export default function Friends() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('friends')

  const filteredFriends = friends.filter(
    (friend) =>
      friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredRequests = friendRequests.filter(
    (request) =>
      request.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredSuggestions = suggestedFriends.filter(
    (suggestion) =>
      suggestion.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      suggestion.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleAcceptRequest = (friendId: number) => {
    // In a real app, this would make an API call
    console.log('Accepted friend request for user:', friendId)
  }

  const handleDeclineRequest = (friendId: number) => {
    // In a real app, this would make an API call
    console.log('Declined friend request for user:', friendId)
  }

  const handleAddFriend = (friendId: number) => {
    // In a real app, this would make an API call
    console.log('Sent friend request to user:', friendId)
  }

  const _handleRemoveFriend = (friendId: number) => {
    // In a real app, this would make an API call
    console.log('Removed friend:', friendId)
  }

  const FriendCard = ({
    friend,
    showActions = true,
    actions,
  }: {
    friend: any
    showActions?: boolean
    actions?: React.ReactNode
  }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar>
                <AvatarImage src={friend.avatar} />
                <AvatarFallback>
                  {friend.name
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              {friend.status && (
                <div
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${
                    friend.status === 'online'
                      ? 'bg-green-500'
                      : friend.status === 'away'
                        ? 'bg-yellow-500'
                        : 'bg-gray-500'
                  }`}
                />
              )}
            </div>
            <div>
              <h3 className="font-semibold">{friend.name}</h3>
              <p className="text-sm text-muted-foreground">@{friend.username}</p>
              {friend.mutualFriends && (
                <p className="text-xs text-muted-foreground">
                  {friend.mutualFriends} mutual friends
                </p>
              )}
              {friend.reason && <p className="text-xs text-muted-foreground">{friend.reason}</p>}
              {friend.lastSeen && friend.status !== 'online' && (
                <p className="text-xs text-muted-foreground">Last seen {friend.lastSeen}</p>
              )}
            </div>
          </div>

          {showActions && (
            <div className="flex items-center gap-2">
              {actions || (
                <>
                  <Button size="sm" variant="outline">
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Friends</h1>
          <p className="text-muted-foreground">Connect with people and build your network</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{friends.length}</div>
              <div className="text-sm text-muted-foreground">Friends</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-500">{friendRequests.length}</div>
              <div className="text-sm text-muted-foreground">Requests</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-500">{suggestedFriends.length}</div>
              <div className="text-sm text-muted-foreground">Suggestions</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
            <TabsTrigger value="requests">Requests ({friendRequests.length})</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions ({suggestedFriends.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-4 mt-6">
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend) => <FriendCard key={friend.id} friend={friend} />)
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No friends found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? 'Try adjusting your search terms.'
                      : 'Start connecting with people!'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-4 mt-6">
            {filteredRequests.length > 0 ? (
              filteredRequests.map((request) => (
                <FriendCard
                  key={request.id}
                  friend={request}
                  actions={
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptRequest(request.id)}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeclineRequest(request.id)}
                      >
                        <UserMinus className="w-4 h-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  }
                />
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <UserPlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No friend requests</h3>
                  <p className="text-muted-foreground">You're all caught up!</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4 mt-6">
            {filteredSuggestions.length > 0 ? (
              filteredSuggestions.map((suggestion) => (
                <FriendCard
                  key={suggestion.id}
                  friend={suggestion}
                  actions={
                    <Button size="sm" onClick={() => handleAddFriend(suggestion.id)}>
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add Friend
                    </Button>
                  }
                />
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No suggestions found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? 'Try adjusting your search terms.'
                      : 'Check back later for friend suggestions!'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
