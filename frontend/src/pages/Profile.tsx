import { Calendar, Camera, Copy, Edit, Eye, EyeOff, Key } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useLogout } from '@/hooks/useAuth'
import { useMyProfile, useUpdateMyProfile, useValidateToken } from '@/hooks/useUsers'

export default function Profile() {
  const [isEditing, setIsEditing] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  const _navigate = useNavigate()
  const logout = useLogout()
  const { data: user, isLoading, error } = useMyProfile()
  const updateProfile = useUpdateMyProfile()
  const { data: _tokenValid, isLoading: tokenValidating } = useValidateToken()

  // Handle authentication errors
  useEffect(() => {
    if (error) {
      // Check if it's an authentication error (401 Unauthorized or 403 Forbidden)
      const isAuthError =
        error.message?.includes('401') ||
        error.message?.includes('403') ||
        error.message?.includes('Unauthorized') ||
        error.message?.includes('Forbidden')

      if (isAuthError) {
        // Clear invalid token and redirect to login
        console.warn('Authentication token invalid, redirecting to login')
        logout()
      }
    }
  }, [error, logout])

  const [editedProfile, setEditedProfile] = useState({
    username: '',
    bio: '',
    avatar: '',
  })

  const token = localStorage.getItem('token') || ''

  const handleSave = () => {
    updateProfile.mutate(editedProfile, {
      onSuccess: () => {
        setIsEditing(false)
      },
    })
  }

  const handleInputChange = (field: string, value: string) => {
    setEditedProfile((prev) => ({ ...prev, [field]: value }))
  }

  const handleEdit = () => {
    if (user) {
      setEditedProfile({
        username: user.username,
        bio: user.bio || '',
        avatar: user.avatar || '',
      })
    }
    setIsEditing(true)
  }

  const copyToken = () => {
    navigator.clipboard.writeText(token)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }

  if (isLoading || tokenValidating) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">Please log in to view your profile</p>
        </div>
      </div>
    )
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
                    <AvatarImage
                      src={
                        user.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`
                      }
                    />
                    <AvatarFallback className="text-2xl">
                      {user.username[0].toUpperCase()}
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
                          value={editedProfile.username}
                          onChange={(e) => handleInputChange('username', e.target.value)}
                          placeholder="Username"
                        />
                        <Input
                          value={editedProfile.avatar}
                          onChange={(e) => handleInputChange('avatar', e.target.value)}
                          placeholder="Avatar URL"
                          className="text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <h1 className="text-2xl font-bold">{user.username}</h1>
                        <p className="text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">ID: {user.id}</p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={isEditing ? handleSave : handleEdit}
                    variant={isEditing ? 'default' : 'outline'}
                    disabled={updateProfile.isPending}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {updateProfile.isPending ? 'Saving...' : isEditing ? 'Save' : 'Edit Profile'}
                  </Button>
                </div>

                {isEditing ? (
                  <Textarea
                    value={editedProfile.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                ) : (
                  <p className="text-muted-foreground">{user.bio || 'No bio yet'}</p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {formatDate(user.created_at)}</span>
                  </div>
                </div>

                {/* JWT Token Section */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Key className="w-4 h-4" />
                          <span>JWT Token (for testing)</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowToken(!showToken)}
                          >
                            {showToken ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={copyToken}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="font-mono text-xs break-all p-2 bg-background rounded border">
                        {showToken ? token : '••••••••••••••••••••••••••••••••••••••••'}
                      </div>
                      {tokenCopied && (
                        <p className="text-xs text-green-600">Token copied to clipboard!</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Account Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID:</span>
                <span className="font-mono">{user.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username:</span>
                <span>{user.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span>{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Created:</span>
                <span>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated:</span>
                <span>{new Date(user.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
