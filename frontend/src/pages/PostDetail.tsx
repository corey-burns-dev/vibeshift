import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, Heart, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PostCaption } from '@/components/posts/PostCaption'
import { PostComments } from '@/components/posts/PostComments'
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLikePost, usePost } from '@/hooks/usePosts'
import { useIsAuthenticated } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

export default function PostDetail() {
    const { id } = useParams()
    const postId = Number(id)
    const isAuthenticated = useIsAuthenticated()
    const { data: post, isLoading, isError } = usePost(postId)
    const likePostMutation = useLikePost()

    if (!postId) {
        return (
            <div className="flex-1 overflow-y-auto py-10">
                <div className="max-w-3xl mx-auto px-4">
                    <p className="text-muted-foreground">Post not found.</p>
                </div>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (isError || !post) {
        return (
            <div className="flex-1 overflow-y-auto py-10">
                <div className="max-w-3xl mx-auto px-4">
                    <p className="text-muted-foreground">Unable to load this post.</p>
                </div>
            </div>
        )
    }

    const handleLikeToggle = () => {
        if (!isAuthenticated) return
        likePostMutation.mutate(post.id, {
            onError: (error) => {
                console.error('Failed to toggle like:', error)
            },
        })
    }

    return (
        <div className="flex-1 overflow-y-auto py-8">
            <div className="max-w-3xl mx-auto px-4">
                <Button variant="ghost" asChild className="mb-4 gap-2">
                    <Link to="/posts">
                        <ArrowLeft className="h-4 w-4" />
                        Back to posts
                    </Link>
                </Button>

                <Card className="border bg-card/95 shadow-sm rounded-2xl overflow-hidden">
                    <CardContent className="p-0">
                        <div className="flex items-center justify-between px-5 py-4">
                            {post.user && (
                                <UserMenu user={post.user}>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="w-9 h-9 ring-1 ring-border">
                                            <AvatarImage
                                                src={
                                                    post.user.avatar ||
                                                    getAvatarUrl(post.user.username)
                                                }
                                            />
                                            <AvatarFallback>
                                                {post.user.username?.[0]?.toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold text-sm">
                                                {post.user.username}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(post.created_at), {
                                                    addSuffix: true,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                </UserMenu>
                            )}
                        </div>

                        {post.image_url ? (
                            <div className="relative w-full bg-muted overflow-hidden">
                                <img
                                    src={post.image_url}
                                    alt={`Post by ${post.user?.username}`}
                                    className="w-full max-h-[520px] object-cover"
                                    loading="lazy"
                                />
                            </div>
                        ) : null}

                        <div className="px-5 py-4 space-y-4">
                            <PostCaption title={post.title} content={post.content} />

                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleLikeToggle}
                                    className="hover:opacity-70 transition-opacity"
                                    disabled={!isAuthenticated}
                                >
                                    <Heart
                                        className={cn(
                                            'w-6 h-6 transition-all',
                                            post.liked
                                                ? 'fill-red-500 text-red-500 scale-110'
                                                : 'text-foreground'
                                        )}
                                    />
                                </button>
                                <span className="text-sm text-muted-foreground">
                                    {post.likes_count} likes
                                </span>
                            </div>

                            <PostComments postId={post.id} />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
