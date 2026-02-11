import { useQueries } from '@tanstack/react-query'
import { Calendar, Heart, MessageCircle, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePosts } from '@/hooks/usePosts'
import { useUserProfile } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'

export default function UserProfile() {
  const params = useParams()
  const id = params.id ? Number(params.id) : NaN

  const { data: user, isLoading, error } = useUserProfile(id)
  const { data: allPosts = [] } = usePosts({ limit: 200, offset: 0 })

  const userPosts = useMemo(() => {
    if (!user) return []
    return allPosts.filter(p => p.user_id === user.id)
  }, [allPosts, user])

  // Sample posts to fetch comments for (limit to 60 to avoid too many requests)
  const sampledPostsForComments = useMemo(
    () => userPosts.slice(0, 60),
    [userPosts]
  )

  const commentQueries = useQueries({
    queries: sampledPostsForComments.map(post => ({
      queryKey: ['comments', 'profile-scan', post.id],
      queryFn: () => apiClient.getPostComments(post.id),
      staleTime: 60_000,
    })),
  })

  const scannedComments = useMemo(() => {
    return commentQueries.flatMap(q => q.data ?? [])
  }, [commentQueries])

  const userComments = useMemo(() => {
    if (!user) return []
    return scannedComments
      .filter(c => c.user_id === user.id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  }, [scannedComments, user])

  const likesReceived = useMemo(() => {
    return userPosts.reduce((sum, post) => sum + (post.likes_count || 0), 0)
  }, [userPosts])

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  if (isLoading) {
    return (
      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-6xl px-4 py-8 text-center'>
          <p className='text-muted-foreground'>Loading user...</p>
        </div>
      </div>
    )
  }

  if (!user || error) {
    return (
      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-6xl px-4 py-8 text-center'>
          <p className='text-muted-foreground'>User not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex-1 overflow-y-auto py-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-6 px-4'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col gap-6 md:flex-row md:items-start md:justify-between'>
              <div className='flex items-start gap-4'>
                <Avatar className='h-20 w-20 border border-border/60'>
                  <AvatarImage
                    src={user.avatar || getAvatarUrl(user.username)}
                  />
                  <AvatarFallback className='text-xl'>
                    {user.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className='space-y-1'>
                  <h1 className='text-2xl font-bold'>{user.username}</h1>
                  <p className='text-sm text-muted-foreground'>{user.email}</p>

                  <div className='flex items-center gap-2 pt-1 text-xs text-muted-foreground'>
                    <Calendar className='h-3.5 w-3.5' />
                    Joined {formatDate(user.created_at)}
                  </div>
                </div>
              </div>

              <div className='w-full md:w-90'>
                <p className='text-sm text-muted-foreground'>
                  {user.bio || 'No bio yet.'}
                </p>

                <div className='mt-3 flex justify-end'>
                  <Link
                    to='/users'
                    className='text-sm text-primary hover:underline'
                  >
                    Back to users
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className='grid gap-6 lg:grid-cols-3'>
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle className='text-lg'>Recent Posts</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {userPosts.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No posts yet.</p>
              ) : (
                userPosts.slice(0, 8).map(post => (
                  <Link
                    key={post.id}
                    to={`/posts/${post.id}`}
                    className='block rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/40'
                  >
                    <p className='truncate font-semibold'>{post.title}</p>
                    <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                      {post.content}
                    </p>
                    <div className='mt-2 flex items-center gap-3 text-xs text-muted-foreground'>
                      <span className='inline-flex items-center gap-1'>
                        <Heart className='h-3.5 w-3.5' /> {post.likes_count}
                      </span>
                      <span className='inline-flex items-center gap-1'>
                        <MessageCircle className='h-3.5 w-3.5' />{' '}
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
              <CardTitle className='text-lg'>About</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>User ID</span>
                <span className='font-mono'>{user.id}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Access</span>
                <span className='inline-flex items-center gap-1'>
                  <UserRound className='h-3.5 w-3.5' />{' '}
                  {user.is_admin ? 'Admin' : 'Member'}
                </span>
              </div>

              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Posts</span>
                <span className='font-mono'>{userPosts.length}</span>
              </div>

              <div className='flex justify-between'>
                <span className='text-muted-foreground'>
                  Comments (sampled)
                </span>
                <span className='font-mono'>{userComments.length}</span>
              </div>

              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Likes Received</span>
                <span className='font-mono'>{likesReceived}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
