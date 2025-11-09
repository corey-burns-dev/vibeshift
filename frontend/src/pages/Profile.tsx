import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, Camera, Edit, Heart, MapPin, MessageCircle } from 'lucide-react'
import { useState } from 'react'

export default function Profile() {
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState({
    name: 'John Doe',
    username: 'johndoe',
    email: 'john@example.com',
    bio: 'Full-stack developer passionate about creating amazing user experiences. Love coding, gaming, and coffee! ☕',
    location: 'San Francisco, CA',
    website: 'https://johndoe.dev',
    joinDate: 'January 2024',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john'
  })

  const [stats] = useState({
    posts: 42,
    followers: 128,
    following: 89,
    likes: 256
  })

  const [posts] = useState([
    {
      id: 1,
      content: 'Just shipped a new feature! 🚀 The new dark mode toggle is working perfectly.',
      timestamp: '2h ago',
      likes: 12,
      comments: 3
    },
    {
      id: 2,
      content: 'Working on some Go backend optimizations. Fiber v2 is amazing!',
      timestamp: '1d ago',
      likes: 8,
      comments: 2
    }
  ])

  const handleSave = () => {
    setIsEditing(false)
    // Here you would typically save to backend
  }

  const handleInputChange = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex flex-col items-center md:items-start">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.avatar} />
                    <AvatarFallback className="text-2xl">
                      {profile.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={profile.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="text-2xl font-bold"
                        />
                        <Input
                          value={profile.username}
                          onChange={(e) => handleInputChange('username', e.target.value)}
                          className="text-muted-foreground"
                        />
                      </div>
                    ) : (
                      <div>
                        <h1 className="text-2xl font-bold">{profile.name}</h1>
                        <p className="text-muted-foreground">@{profile.username}</p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={isEditing ? handleSave : () => setIsEditing(true)}
                    variant={isEditing ? "default" : "outline"}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {isEditing ? 'Save' : 'Edit Profile'}
                  </Button>
                </div>

                {isEditing ? (
                  <Textarea
                    value={profile.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                ) : (
                  <p className="text-muted-foreground">{profile.bio}</p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {isEditing ? (
                      <Input
                        value={profile.location}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                        className="h-6 px-1 text-sm"
                      />
                    ) : (
                      <span>{profile.location}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {profile.joinDate}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="font-bold text-lg">{stats.posts}</div>
                    <div className="text-sm text-muted-foreground">Posts</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">{stats.followers}</div>
                    <div className="text-sm text-muted-foreground">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">{stats.following}</div>
                    <div className="text-sm text-muted-foreground">Following</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">{stats.likes}</div>
                    <div className="text-sm text-muted-foreground">Likes</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Content */}
        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="likes">Likes</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="space-y-4 mt-6">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardContent className="pt-6">
                  <p className="mb-4">{post.content}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{post.timestamp}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Heart className="w-4 h-4" />
                        <span>{post.likes}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-4 h-4" />
                        <span>{post.comments}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="media" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No media posts yet</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="likes" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No liked posts yet</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}