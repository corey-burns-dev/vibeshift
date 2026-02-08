import { useQueries } from '@tanstack/react-query'
import { Calendar, Edit, Heart, MessageCircle, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useLogout } from '@/hooks/useAuth'
import { useFriends } from '@/hooks/useFriends'
import { usePosts } from '@/hooks/usePosts'
import { useAllUsers, useMyProfile, useUpdateMyProfile } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'

export default function Profile() {
    const [isEditing, setIsEditing] = useState(false)
    const [editedProfile, setEditedProfile] = useState({
        username: '',
        bio: '',
        avatar: '',
    })

    const logout = useLogout()
    const { data: user, isLoading, error } = useMyProfile()
    const updateProfile = useUpdateMyProfile()

    const { data: allPosts = [], isLoading: postsLoading } = usePosts({
        limit: 120,
        offset: 0,
    })
    const { data: friends = [] } = useFriends()
    const { data: users = [] } = useAllUsers()

    const sampledPostsForComments = useMemo(() => allPosts.slice(0, 30), [allPosts])

    const commentQueries = useQueries({
        queries: sampledPostsForComments.map((post) => ({
            queryKey: ['comments', 'profile-scan', post.id],
            queryFn: () => apiClient.getPostComments(post.id),
            staleTime: 60_000,
        })),
    })

    useEffect(() => {
        if (!error) return

        const isAuthError =
            error.message?.includes('401') ||
            error.message?.includes('403') ||
            error.message?.includes('Unauthorized') ||
            error.message?.includes('Forbidden')

        if (isAuthError) {
            logout()
        }
    }, [error, logout])

    const myPosts = useMemo(() => {
        if (!user) return []
        return allPosts.filter((post) => post.user_id === user.id)
    }, [allPosts, user])

    const likedPosts = useMemo(() => {
        return allPosts.filter((post) => post.liked)
    }, [allPosts])

    const scannedComments = useMemo(() => {
        return commentQueries.flatMap((query) => query.data ?? [])
    }, [commentQueries])

    const myComments = useMemo(() => {
        if (!user) return []

        return scannedComments
            .filter((comment) => comment.user_id === user.id)
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    }, [scannedComments, user])

    const likesReceived = useMemo(() => {
        return myPosts.reduce((sum, post) => sum + (post.likes_count || 0), 0)
    }, [myPosts])

    const communityUsers = useMemo(() => {
        if (!user) return []
        return users.filter((u) => u.id !== user.id).slice(0, 8)
    }, [users, user])

    const isCommentLoading = commentQueries.some((query) => query.isLoading)

    const handleSave = () => {
        updateProfile.mutate(editedProfile, {
            onSuccess: () => {
                setIsEditing(false)
            },
        })
    }

    const handleEdit = () => {
        if (!user) return

        setEditedProfile({
            username: user.username,
            bio: user.bio || '',
            avatar: user.avatar || '',
        })
        setIsEditing(true)
    }

    const handleInputChange = (field: 'username' | 'bio' | 'avatar', value: string) => {
        setEditedProfile((prev) => ({ ...prev, [field]: value }))
    }

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })

    if (isLoading) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-6xl px-4 py-8 text-center">
                    <p className="text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        )
    }

    if (!user) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-6xl px-4 py-8 text-center">
                    <p className="text-muted-foreground">Please log in to view your profile.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto py-6 md:py-8">
            <div className="mx-auto max-w-6xl space-y-6 px-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                            <div className="flex items-start gap-4">
                                <Avatar className="h-20 w-20 border border-border/60">
                                    <AvatarImage src={user.avatar || getAvatarUrl(user.username)} />
                                    <AvatarFallback className="text-xl">
                                        {user.username[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="space-y-1">
                                    {isEditing ? (
                                        <div className="space-y-2">
                                            <Input
                                                value={editedProfile.username}
                                                onChange={(e) =>
                                                    handleInputChange('username', e.target.value)
                                                }
                                                placeholder="Username"
                                            />
                                            <Input
                                                value={editedProfile.avatar}
                                                onChange={(e) =>
                                                    handleInputChange('avatar', e.target.value)
                                                }
                                                placeholder="Avatar URL"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <h1 className="text-2xl font-bold">{user.username}</h1>
                                            <p className="text-sm text-muted-foreground">
                                                {user.email}
                                            </p>
                                        </>
                                    )}

                                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Joined {formatDate(user.created_at)}
                                    </div>
                                </div>
                            </div>

                            <div className="w-full md:w-90">
                                {isEditing ? (
                                    <Textarea
                                        value={editedProfile.bio}
                                        onChange={(e) => handleInputChange('bio', e.target.value)}
                                        placeholder="Tell people about yourself"
                                        rows={4}
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {user.bio || 'No bio yet.'}
                                    </p>
                                )}

                                <div className="mt-3 flex justify-end">
                                    <Button
                                        onClick={isEditing ? handleSave : handleEdit}
                                        variant={isEditing ? 'default' : 'outline'}
                                        disabled={updateProfile.isPending}
                                    >
                                        <Edit className="mr-2 h-4 w-4" />
                                        {updateProfile.isPending
                                            ? 'Saving...'
                                            : isEditing
                                              ? 'Save'
                                              : 'Edit Profile'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardContent className="pt-5">
                            <p className="text-xs text-muted-foreground">Posts</p>
                            <p className="mt-1 text-2xl font-bold">{myPosts.length}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <p className="text-xs text-muted-foreground">Comments</p>
                            <p className="mt-1 text-2xl font-bold">{myComments.length}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <p className="text-xs text-muted-foreground">Likes Received</p>
                            <p className="mt-1 text-2xl font-bold">{likesReceived}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <p className="text-xs text-muted-foreground">Posts Liked</p>
                            <p className="mt-1 text-2xl font-bold">{likedPosts.length}</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg">Recent Posts</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {postsLoading ? (
                                <p className="text-sm text-muted-foreground">Loading posts...</p>
                            ) : myPosts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No posts yet.</p>
                            ) : (
                                myPosts.slice(0, 6).map((post) => (
                                    <Link
                                        key={post.id}
                                        to={`/posts/${post.id}`}
                                        className="block rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/40"
                                    >
                                        <p className="truncate font-semibold">{post.title}</p>
                                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                            {post.content}
                                        </p>
                                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <Heart className="h-3.5 w-3.5" /> {post.likes_count}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <MessageCircle className="h-3.5 w-3.5" />{' '}
                                                {post.comments_count || 0}
                                            </span>
                                            <span>{formatDate(post.created_at)}</span>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Users</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                                    Friends ({friends.length})
                                </p>
                                <div className="space-y-2">
                                    {friends.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No friends yet.
                                        </p>
                                    ) : (
                                        friends.slice(0, 5).map((friend) => (
                                            <div
                                                key={friend.id}
                                                className="flex items-center gap-2"
                                            >
                                                <Avatar className="h-7 w-7">
                                                    <AvatarImage src={friend.avatar} />
                                                    <AvatarFallback>
                                                        {friend.username[0]?.toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="truncate text-sm">
                                                    {friend.username}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                                    Community
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {communityUsers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No users found.
                                        </p>
                                    ) : (
                                        communityUsers.map((u) => (
                                            <Badge
                                                key={u.id}
                                                variant="secondary"
                                                className="font-normal"
                                            >
                                                {u.username}
                                            </Badge>
                                        ))
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg">Recent Comments</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {isCommentLoading ? (
                                <p className="text-sm text-muted-foreground">Loading comments...</p>
                            ) : myComments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No recent comments found in sampled posts.
                                </p>
                            ) : (
                                myComments.slice(0, 8).map((comment) => (
                                    <div
                                        key={comment.id}
                                        className="rounded-lg border border-border/60 p-3"
                                    >
                                        <p className="text-sm">{comment.content}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Post #{comment.post_id} •{' '}
                                            {formatDate(comment.created_at)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Liked Posts</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {likedPosts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No liked posts yet.</p>
                            ) : (
                                likedPosts.slice(0, 8).map((post) => (
                                    <Link
                                        key={post.id}
                                        to={`/posts/${post.id}`}
                                        className="block truncate rounded-md px-2 py-1 text-sm text-primary hover:bg-primary/10"
                                    >
                                        {post.title}
                                    </Link>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {user.is_admin && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <ShieldCheck className="h-5 w-5" />
                                Admin Account Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">User ID</span>
                                <span className="font-mono">{user.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Email</span>
                                <span>{user.email}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Username</span>
                                <span>{user.username}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Created</span>
                                <span>{formatDate(user.created_at)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Updated</span>
                                <span>{formatDate(user.updated_at)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Access</span>
                                <span className="inline-flex items-center gap-1">
                                    <UserRound className="h-3.5 w-3.5" /> Admin
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
