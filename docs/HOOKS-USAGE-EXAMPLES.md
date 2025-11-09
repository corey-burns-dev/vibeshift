# Hooks Usage Examples

Complete component examples showing how to use the API hooks in real-world scenarios.

## Example 1: Simple Posts List

Basic posts list with loading and error states:

```tsx
import { usePosts } from '@/hooks'
import { Loader2 } from 'lucide-react'

export function PostsList() {
  const { data: posts, isLoading, error } = usePosts({ limit: 10 })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>
  }

  return (
    <div className="space-y-4">
      {posts?.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

## Example 2: Infinite Scroll Posts

Infinite scroll implementation with "Load More" button:

```tsx
import { useInfinitePosts } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export function InfinitePostsList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfinitePosts(10)

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data?.pages.map((page, i) => (
        <div key={i} className="space-y-4">
          {page.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ))}
      
      {hasNextPage && (
        <Button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </div>
  )
}
```

## Example 3: Create Post Form

Form with validation and loading states:

```tsx
import { useCreatePost } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

export function CreatePostForm() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  
  const createPost = useCreatePost()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createPost.mutateAsync({
        title,
        content,
        image_url: imageUrl || undefined,
      })
      
      // Reset form on success
      setTitle('')
      setContent('')
      setImageUrl('')
    } catch (error) {
      console.error('Failed to create post:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Post</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={4}
            />
          </div>
          
          <div>
            <Label htmlFor="imageUrl">Image URL (optional)</Label>
            <Input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
          
          <Button type="submit" disabled={createPost.isPending}>
            {createPost.isPending ? 'Creating...' : 'Create Post'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

## Example 4: Post Card with Actions

Reusable post card with like and delete functionality:

```tsx
import { useDeletePost, useLikePost } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart, Trash2 } from 'lucide-react'
import type { Post } from '@/api/types'

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const likePost = useLikePost(post.id)
  const deletePost = useDeletePost()

  const handleLike = () => {
    likePost.mutate()
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this post?')) {
      deletePost.mutate(post.id)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">{post.content}</p>
        
        {post.image_url && (
          <img 
            src={post.image_url} 
            alt={post.title}
            className="rounded-lg mb-4 w-full object-cover"
          />
        )}
        
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={likePost.isPending}
          >
            <Heart 
              className={`w-4 h-4 mr-2 ${
                post.likes > 0 ? 'fill-red-500 text-red-500' : ''
              }`} 
            />
            {post.likes}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deletePost.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

## Example 5: Comments Section

Display and create comments for a post:

```tsx
import { usePostComments, useCreateComment } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

export function CommentsSection({ postId }: { postId: number }) {
  const [newComment, setNewComment] = useState('')
  const { data: comments, isLoading } = usePostComments(postId)
  const createComment = useCreateComment(postId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createComment.mutateAsync({ content: newComment })
      setNewComment('')
    } catch (error) {
      console.error('Failed to create comment:', error)
    }
  }

  if (isLoading) {
    return <Loader2 className="animate-spin" />
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Comments ({comments?.length || 0})</h3>
      
      {/* Comment list */}
      <div className="space-y-2">
        {comments?.map((comment) => (
          <div key={comment.id} className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{comment.content}</p>
            <p className="text-xs text-muted-foreground mt-1">
              by {comment.user?.username}
            </p>
          </div>
        ))}
      </div>
      
      {/* Create comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          required
        />
        <Button type="submit" disabled={createComment.isPending}>
          {createComment.isPending ? 'Posting...' : 'Post Comment'}
        </Button>
      </form>
    </div>
  )
}
```

## Example 6: User Profile

Display and edit user profile:

```tsx
import { useMyProfile, useUpdateMyProfile } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

export function ProfileEditor() {
  const { data: profile, isLoading } = useMyProfile()
  const updateProfile = useUpdateMyProfile()
  
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setUsername(profile.username)
      setBio(profile.bio || '')
      setAvatar(profile.avatar || '')
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await updateProfile.mutateAsync({
        username,
        bio,
        avatar,
      })
    } catch (error) {
      console.error('Failed to update profile:', error)
    }
  }

  if (isLoading) {
    return <Loader2 className="animate-spin" />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      
      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
      </div>
      
      <div>
        <Label htmlFor="avatar">Avatar URL</Label>
        <Input
          id="avatar"
          type="url"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
        />
      </div>
      
      <Button type="submit" disabled={updateProfile.isPending}>
        {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  )
}
```

## Example 7: Search Posts

Search functionality with debouncing:

```tsx
import { useSearchPosts } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'

export function SearchPosts() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [query])
  
  const { data: results, isLoading } = useSearchPosts({
    q: debouncedQuery,
    limit: 20,
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input
          type="search"
          placeholder="Search posts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-3 animate-spin w-4 h-4" />
        )}
      </div>
      
      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      
      {debouncedQuery && results?.length === 0 && (
        <p className="text-muted-foreground text-center">No results found</p>
      )}
    </div>
  )
}
```

## Tips

- **Loading States**: Always handle `isLoading` for better UX
- **Error Handling**: Display error messages to users
- **Optimistic Updates**: Like and delete actions update UI instantly
- **Form Reset**: Clear forms after successful mutations
- **Debouncing**: Use for search to reduce API calls
- **Type Safety**: Import types from `@/api/types` for props
