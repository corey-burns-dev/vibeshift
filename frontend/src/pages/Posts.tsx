import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Heart, MessageCircle, MoreHorizontal, Send, Share } from 'lucide-react'
import { useState } from 'react'

// Mock data for posts
const mockPosts = [
  {
    id: 1,
    author: 'alice_dev',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    content:
      'Just shipped a new feature! 🚀 The new dark mode toggle is working perfectly. Loving the new Tailwind v4 setup.',
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=500&h=400&fit=crop',
    likes: 42,
    comments: [
      {
        id: 1,
        author: 'bob_coder',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
        content: 'Congrats! The dark mode looks amazing 🎉',
        timestamp: '2h ago',
      },
      {
        id: 2,
        author: 'charlie_ui',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
        content: "Tailwind v4 is a game changer! How's the performance?",
        timestamp: '1h ago',
      },
    ],
    timestamp: '2h ago',
  },
  {
    id: 2,
    author: 'bob_coder',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    content:
      'Working on some Go backend optimizations. Fiber v2 is amazing for performance! The Redis integration is smooth.',
    image: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=500&h=400&fit=crop',
    likes: 28,
    comments: [
      {
        id: 3,
        author: 'alice_dev',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
        content: 'Fiber v2 is incredible! What optimizations are you implementing?',
        timestamp: '3h ago',
      },
    ],
    timestamp: '4h ago',
  },
  {
    id: 3,
    author: 'charlie_ui',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
    content:
      'The new shadcn/ui components are incredible. Building this chat interface was so much easier with the scroll area and inputs.',
    likes: 67,
    comments: [
      {
        id: 4,
        author: 'alice_dev',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
        content: 'shadcn/ui is a lifesaver! The components are so well designed.',
        timestamp: '5h ago',
      },
      {
        id: 5,
        author: 'bob_coder',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
        content: 'Agreed! The accessibility features are top-notch too.',
        timestamp: '4h ago',
      },
      {
        id: 6,
        author: 'diana_design',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
        content: "Can't wait to try the new scroll area component!",
        timestamp: '3h ago',
      },
    ],
    timestamp: '6h ago',
  },
]

export default function Posts() {
  const [newPost, setNewPost] = useState('')
  const [posts, setPosts] = useState(mockPosts)
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set())
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())
  const [newComments, setNewComments] = useState<Record<number, string>>({})

  const handleLike = (postId: number) => {
    setLikedPosts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(postId)) {
        newSet.delete(postId)
        setPosts((prevPosts) =>
          prevPosts.map((post) => (post.id === postId ? { ...post, likes: post.likes - 1 } : post))
        )
      } else {
        newSet.add(postId)
        setPosts((prevPosts) =>
          prevPosts.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post))
        )
      }
      return newSet
    })
  }

  const handleNewPost = () => {
    if (!newPost.trim()) return

    const post = {
      id: posts.length + 1,
      author: 'you',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=you',
      content: newPost,
      likes: 0,
      comments: [],
      timestamp: 'now',
    }

    setPosts([post, ...posts])
    setNewPost('')
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

  const handleNewComment = (postId: number) => {
    const commentText = newComments[postId]
    if (!commentText?.trim()) return

    const newComment = {
      id: Date.now(), // Simple ID generation
      author: 'you',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=you',
      content: commentText,
      timestamp: 'now',
    }

    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId ? { ...post, comments: [...post.comments, newComment] } : post
      )
    )

    setNewComments((prev) => ({ ...prev, [postId]: '' }))
  }

  const handleCommentChange = (postId: number, value: string) => {
    setNewComments((prev) => ({ ...prev, [postId]: value }))
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Create Post */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=you" />
                <AvatarFallback>Y</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">Create Post</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="What's on your mind?"
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              className="mb-3 resize-none"
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={handleNewPost} disabled={!newPost.trim()}>
                <Send className="w-4 h-4 mr-2" />
                Post
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Posts Feed */}
        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={post.avatar} />
                      <AvatarFallback>{post.author[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{post.author}</p>
                      <p className="text-sm text-muted-foreground">{post.timestamp}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4">{post.content}</p>

                {post.image && (
                  <div className="mb-4 rounded-lg overflow-hidden">
                    <img
                      src={post.image}
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
                      onClick={() => handleLike(post.id)}
                      className={likedPosts.has(post.id) ? 'text-red-500' : ''}
                    >
                      <Heart
                        className={`w-4 h-4 mr-2 ${likedPosts.has(post.id) ? 'fill-current' : ''}`}
                      />
                      {post.likes}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleComments(post.id)}
                      className={expandedComments.has(post.id) ? 'text-blue-500' : ''}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      {post.comments.length}
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Share className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </div>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="mt-4 pt-4 border-t">
                    {/* Existing Comments */}
                    <div className="space-y-3 mb-4">
                      {post.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <Avatar className="w-8 h-8 shrink-0">
                            <AvatarImage src={comment.avatar} />
                            <AvatarFallback className="text-xs">
                              {comment.author[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="bg-muted rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm">{comment.author}</span>
                                <span className="text-xs text-muted-foreground">
                                  {comment.timestamp}
                                </span>
                              </div>
                              <p className="text-sm">{comment.content}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Comment */}
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=you" />
                        <AvatarFallback className="text-xs">Y</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 flex gap-2">
                        <Textarea
                          placeholder="Write a comment..."
                          value={newComments[post.id] || ''}
                          onChange={(e) => handleCommentChange(post.id, e.target.value)}
                          className="resize-none text-sm"
                          rows={2}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleNewComment(post.id)}
                          disabled={!newComments[post.id]?.trim()}
                          className="self-end"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
