import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useCreateComment, usePostComments } from '@/hooks/useComments'
import { useCreatePost, useInfinitePosts, useLikePost } from '@/hooks/usePosts'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import { formatDistanceToNow } from 'date-fns'
import { Heart, Loader2, MessageCircle, Send } from 'lucide-react'
import { useEffect, useState } from 'react'

// Component for individual post comments
function PostComments({ postId }: { postId: number }) {
  const [newComment, setNewComment] = useState('')
  const currentUser = getCurrentUser()

  const { data: comments = [], isLoading } = usePostComments(postId)
  const createCommentMutation = useCreateComment(postId)

  const handleCreateComment = () => {
    if (!newComment.trim()) return

    createCommentMutation.mutate(
      { content: newComment },
      {
        onSuccess: () => {
          setNewComment('')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t">
      {/* Existing Comments */}
      <div className="space-y-3 mb-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage
                src={
                  comment.user?.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.user?.username}`
                }
              />
              <AvatarFallback className="text-xs">
                {comment.user?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{comment.user?.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Comment */}
      {currentUser && (
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage
              src={
                currentUser.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`
              }
            />
            <AvatarFallback className="text-xs">
              {currentUser.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex gap-2">
            <Textarea
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="resize-none text-sm"
              rows={2}
              disabled={createCommentMutation.isPending}
            />
            <Button
              size="sm"
              onClick={handleCreateComment}
              disabled={!newComment.trim() || createCommentMutation.isPending}
              className="self-end"
            >
              {createCommentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Posts() {
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())

  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePosts(10)
  const createPostMutation = useCreatePost()

  // Flatten pages into single array of posts
  const posts = data?.pages.flatMap((page) => page) ?? []

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleNewPost = () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) return

    createPostMutation.mutate(
      {
        title: newPostTitle,
        content: newPostContent,
      },
      {
        onSuccess: () => {
          setNewPostTitle('')
          setNewPostContent('')
        },
      }
    )
  }

  const toggleComments = (postId: number) => {
    setExpandedComments((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(postId)) {
        newSet.delete(postId)
      } else {
        newSet.add(postId)
      }
      return newSet
    })
  }

  const handleLikePost = (postId: number) => {
    useLikePost(postId).mutate()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-6 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Create Post */}
        {isAuthenticated && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage
                    src={
                      currentUser?.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.username}`
                    }
                  />
                  <AvatarFallback>
                    {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">Create Post</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                placeholder="Post title..."
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                className="w-full mb-3 px-3 py-2 border rounded-md"
                disabled={createPostMutation.isPending}
              />
              <Textarea
                placeholder="What's on your mind?"
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="mb-3 resize-none"
                rows={3}
                disabled={createPostMutation.isPending}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleNewPost}
                  disabled={
                    !newPostTitle.trim() ||
                    !newPostContent.trim() ||
                    createPostMutation.isPending
                  }
                >
                  {createPostMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Post
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Posts Feed */}
        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage
                        src={
                          post.user?.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.username}`
                        }
                      />
                      <AvatarFallback>
                        {post.user?.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{post.user?.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
                <p className="mb-4">{post.content}</p>

                {post.image_url && (
                  <div className="mb-4 rounded-lg overflow-hidden">
                    <img
                      src={post.image_url}
                      alt="Post content"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLikePost(post.id)}
                      disabled={!isAuthenticated}
                    >
                      <Heart className="w-4 h-4 mr-2" />
                      {post.likes}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleComments(post.id)}
                      className={expandedComments.has(post.id) ? 'text-blue-500' : ''}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Comments
                    </Button>
                  </div>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && <PostComments postId={post.id} />}
              </CardContent>
            </Card>
          ))}

          {/* Loading indicator for infinite scroll */}
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* End of feed */}
          {!hasNextPage && posts.length > 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              You've reached the end!
            </div>
          )}

          {/* Empty state */}
          {posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No posts yet</p>
              {isAuthenticated && <p className="text-sm">Be the first to create a post!</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
