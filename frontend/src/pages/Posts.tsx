// API

import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Heart, Image, Loader2, MessageCircle, Send, Smile, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
// Types
import type { Post } from '@/api/types'
import { PostCaption } from '@/components/posts/PostCaption'
// Components
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
// Hooks
import { useCreatePost, useInfinitePosts, useLikePost } from '@/hooks/usePosts'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'
import { handleAuthOrFKError } from '@/lib/handleAuthOrFKError'
import { cn } from '@/lib/utils'

export default function Posts() {
    const [newPostTitle, setNewPostTitle] = useState('')
    const [newPostContent, setNewPostContent] = useState('')
    const [newPostImage, setNewPostImage] = useState('')
    const [isExpandingPost, setIsExpandingPost] = useState(false)

    const isAuthenticated = useIsAuthenticated()
    const currentUser = getCurrentUser()
    const navigate = useNavigate()
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfinitePosts(10)
    const createPostMutation = useCreatePost()
    const likePostMutation = useLikePost()
    const [editingPostId, setEditingPostId] = useState<number | null>(null)
    const [editingPostTitle, setEditingPostTitle] = useState('')
    const [editingPostContent, setEditingPostContent] = useState('')
    const queryClient = useQueryClient()
    const debounceRef = useRef<number | null>(null)
    const [likingPostId, setLikingPostId] = useState<number | null>(null)

    // Flatten pages into single array of posts
    const posts = data?.pages.flat() ?? []

    // Infinite scroll with debouncing
    useEffect(() => {
        const handleScroll = () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current)
            }
            debounceRef.current = setTimeout(() => {
                if (
                    window.innerHeight + window.scrollY >=
                        document.documentElement.scrollHeight - 500 &&
                    hasNextPage &&
                    !isFetchingNextPage
                ) {
                    fetchNextPage()
                }
            }, 200)
        }

        window.addEventListener('scroll', handleScroll)
        return () => {
            window.removeEventListener('scroll', handleScroll)
            if (debounceRef.current) {
                clearTimeout(debounceRef.current)
            }
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    const handleNewPost = () => {
        if (!newPostContent.trim()) return

        createPostMutation.mutate(
            {
                title: newPostTitle.trim() || `${currentUser?.username}'s Post`,
                content: newPostContent,
                image_url: newPostImage.trim() || undefined,
            },
            {
                onSuccess: () => {
                    setNewPostTitle('')
                    setNewPostContent('')
                    setNewPostImage('')
                    setIsExpandingPost(false)
                    // Invalidate posts query to refresh the list
                    queryClient.invalidateQueries({ queryKey: ['posts'] })
                },
                onError: (error) => {
                    if (!handleAuthOrFKError(error)) {
                        console.error('Failed to create post:', error)
                    }
                },
            }
        )
    }

    const handleLikeToggle = (post: Post) => {
        if (likingPostId === post.id) return // Prevent double-clicks

        setLikingPostId(post.id)
        // Backend now handles toggle logic automatically
        likePostMutation.mutate(post.id, {
            onSuccess: () => {
                setLikingPostId(null)
            },
            onError: (error) => {
                setLikingPostId(null)
                console.error('Failed to toggle like:', error)
            },
        })
    }

    const startEditPost = (post: Post) => {
        setEditingPostId(post.id)
        setEditingPostTitle(post.title ?? '')
        setEditingPostContent(post.content ?? '')
    }

    const cancelEditPost = () => {
        setEditingPostId(null)
        setEditingPostTitle('')
        setEditingPostContent('')
    }

    const saveEditPost = async (postId: number) => {
        if (!editingPostTitle.trim() || !editingPostContent.trim()) return
        try {
            await apiClient.updatePost(postId, {
                title: editingPostTitle,
                content: editingPostContent,
            })
            await queryClient.invalidateQueries({ queryKey: ['posts'] })
            cancelEditPost()
        } catch (err) {
            console.error('Failed to update post:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto py-8">
            <div className="max-w-3xl mx-auto px-4">
                {/* Create Post */}
                {isAuthenticated && (
                    <Card className="mb-6 overflow-hidden border bg-card/95 shadow-sm hover:shadow-md transition-shadow rounded-2xl">
                        <CardContent className="p-5">
                            <div className="flex gap-3 mb-4">
                                <Avatar className="w-10 h-10 ring-2 ring-primary/5">
                                    <AvatarImage
                                        src={
                                            currentUser?.avatar ||
                                            getAvatarUrl(currentUser?.username ?? 'user')
                                        }
                                    />
                                    <AvatarFallback>
                                        {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-3">
                                    <label
                                        htmlFor="post-content"
                                        className={cn(
                                            'bg-muted px-4 py-2.5 rounded-3xl transition-all cursor-text block',
                                            !isExpandingPost && 'hover:bg-muted/80'
                                        )}
                                    >
                                        <Textarea
                                            id="post-content"
                                            placeholder={`What's on your mind, ${currentUser?.username}?`}
                                            value={newPostContent}
                                            onChange={(e) => {
                                                setNewPostContent(e.target.value)
                                                if (!isExpandingPost) setIsExpandingPost(true)
                                            }}
                                            onFocus={() => {
                                                if (!isExpandingPost) setIsExpandingPost(true)
                                            }}
                                            className="resize-none bg-transparent border-none focus-visible:ring-0 p-0 text-[15px] min-h-10 placeholder:text-muted-foreground/60 w-full shadow-none focus:ring-0"
                                            rows={isExpandingPost ? 3 : 1}
                                            disabled={createPostMutation.isPending}
                                        />
                                    </label>

                                    {isExpandingPost && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <input
                                                type="text"
                                                placeholder="Post Title (optional)..."
                                                value={newPostTitle}
                                                onChange={(e) => setNewPostTitle(e.target.value)}
                                                className="w-full text-sm font-semibold bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Image URL (optional)..."
                                                value={newPostImage}
                                                onChange={(e) => setNewPostImage(e.target.value)}
                                                className="w-full text-sm bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40"
                                            />
                                            <div className="flex justify-between items-center pt-2">
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                        onClick={() => setIsExpandingPost(false)}
                                                        className="text-xs font-semibold text-muted-foreground"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                                <Button
                                                    onClick={handleNewPost}
                                                    size="sm"
                                                    disabled={
                                                        !newPostContent.trim() ||
                                                        createPostMutation.isPending
                                                    }
                                                    className="rounded-full px-6 shadow-sm"
                                                >
                                                    {createPostMutation.isPending ? (
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Send className="w-4 h-4 mr-2" />
                                                    )}
                                                    Post
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {!isExpandingPost && (
                                <div className="flex border-t pt-3 justify-around">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2 text-muted-foreground flex-1 hover:bg-muted"
                                        onClick={() => setIsExpandingPost(true)}
                                    >
                                        <Video className="w-4 h-4 text-red-500" />
                                        <span className="text-xs font-semibold">Live</span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2 text-muted-foreground flex-1 hover:bg-muted"
                                        onClick={() => setIsExpandingPost(true)}
                                    >
                                        <Image className="w-4 h-4 text-green-500" />
                                        <span className="text-xs font-semibold">Media</span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2 text-muted-foreground flex-1 hover:bg-muted"
                                        onClick={() => setIsExpandingPost(true)}
                                    >
                                        <Smile className="w-4 h-4 text-yellow-500" />
                                        <span className="text-xs font-semibold">Feeling</span>
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Posts Feed */}
                <div className="space-y-6">
                    {posts.map((post) => (
                        <Card
                            key={post.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/posts/${post.id}`)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    navigate(`/posts/${post.id}`)
                                }
                            }}
                            className="border bg-card/95 shadow-sm rounded-2xl overflow-hidden text-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                        >
                            <div className="flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-3">
                                    {post.user && (
                                        <UserMenu user={post.user}>
                                            <button
                                                type="button"
                                                className="flex items-center gap-3 text-left"
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                <Avatar className="w-8 h-8 cursor-pointer ring-1 ring-border">
                                                    <AvatarImage
                                                        src={
                                                            post.user.avatar ||
                                                            getAvatarUrl(post.user.username)
                                                        }
                                                    />
                                                    <AvatarFallback>
                                                        {post.user.username?.[0]?.toUpperCase() ||
                                                            'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-semibold text-sm cursor-pointer">
                                                    {post.user.username}
                                                </span>
                                            </button>
                                        </UserMenu>
                                    )}
                                </div>
                                {currentUser && currentUser.id === post.user_id && (
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                startEditPost(post)
                                            }}
                                        >
                                            <span className="sr-only">Edit</span>
                                            <svg
                                                aria-hidden="true"
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <circle cx="12" cy="12" r="1" />
                                                <circle cx="19" cy="12" r="1" />
                                                <circle cx="5" cy="12" r="1" />
                                            </svg>
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Post Media / Content */}
                            <div className="px-4 pb-3">
                                {post.image_url ? (
                                    <div className="relative aspect-square w-full bg-muted overflow-hidden rounded-xl">
                                        <img
                                            src={post.image_url}
                                            alt={`Post by ${post.user?.username}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </div>
                                ) : (
                                    <div className="p-4 bg-muted/30 rounded-xl border border-border/60">
                                        {editingPostId === post.id ? (
                                            <div className="space-y-4">
                                                <input
                                                    type="text"
                                                    value={editingPostTitle}
                                                    onChange={(e) =>
                                                        setEditingPostTitle(e.target.value)
                                                    }
                                                    className="w-full font-bold bg-transparent border-none focus:ring-0 p-0 text-base"
                                                    placeholder="Title"
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                                <Textarea
                                                    value={editingPostContent}
                                                    onChange={(e) =>
                                                        setEditingPostContent(e.target.value)
                                                    }
                                                    className="min-h-25 border-none focus-visible:ring-0 p-0 -ml-1 resize-none"
                                                    onClick={(event) => event.stopPropagation()}
                                                />
                                                <div className="flex justify-end gap-2 pt-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            cancelEditPost()
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            saveEditPost(post.id)
                                                        }}
                                                    >
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <PostCaption
                                                    title={post.title}
                                                    content={post.content}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="px-4 pt-1 pb-4 grid gap-1">
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            handleLikeToggle(post)
                                        }}
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
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            navigate(`/posts/${post.id}`)
                                        }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        <MessageCircle className="w-6 h-6 -rotate-90" />
                                    </button>
                                    <button
                                        className="hover:opacity-70 transition-opacity ml-auto"
                                        type="button"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <span className="sr-only">Share</span>
                                        <svg
                                            aria-hidden="true"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="w-6 h-6"
                                        >
                                            <path d="M5 12h14" />
                                            <path d="m12 5 7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Likes Count */}
                                <div className="font-semibold text-sm mt-1">
                                    {post.likes_count} likes
                                </div>

                                {/* Caption (if image post) */}
                                {post.image_url && (
                                    <PostCaption
                                        username={post.user?.username}
                                        content={post.content}
                                    />
                                )}

                                {/* Comments Link */}
                                <button
                                    type="button"
                                    className="text-muted-foreground text-sm text-left mt-1 hover:text-foreground"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        navigate(`/posts/${post.id}`)
                                    }}
                                >
                                    {(post.comments_count ?? 0) > 0
                                        ? `View all ${post.comments_count} comments`
                                        : 'Add a comment...'}
                                </button>
                                <p className="text-[10px] text-muted-foreground bg-transparent uppercase tracking-wider mt-1">
                                    {formatDistanceToNow(new Date(post.created_at), {
                                        addSuffix: false,
                                    })}{' '}
                                    AGO
                                </p>
                            </div>
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
                        <div className="flex justify-center py-8 text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-border" />
                        </div>
                    )}

                    {/* Empty state */}
                    {posts.length === 0 && (
                        <div className="text-center py-20">
                            <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-6">
                                <Image className="w-10 h-10 text-muted-foreground" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">No Posts Yet</h3>
                            <p className="text-muted-foreground">
                                Start capturing your moments to see them here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
