// API

import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Flag,
  Heart,
  Image,
  Link2,
  Loader2,
  MessageCircle,
  Send,
  Type,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
// Types
import type { Post, PostType, UpdatePostRequest } from '@/api/types'
import { LinkCard } from '@/components/posts/LinkCard'
import { PollBlock } from '@/components/posts/PollBlock'
import { PostCaption } from '@/components/posts/PostCaption'
import { PostComposerEditor } from '@/components/posts/PostComposerEditor'
import { ResponsiveImage } from '@/components/posts/ResponsiveImage'
import { YouTubeEmbed } from '@/components/posts/YouTubeEmbed'
// Components
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useReportPost } from '@/hooks/useModeration'
// Hooks
import {
  useCreatePost,
  useDeletePost,
  useInfinitePosts,
  useLikePost,
} from '@/hooks/usePosts'
import { getCurrentUser, useIsAuthenticated } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'
import { handleAuthOrFKError } from '@/lib/handleAuthOrFKError'
import { logger } from '@/lib/logger'
import { normalizeImageURL } from '@/lib/mediaUrl'
import { cn } from '@/lib/utils'

const POST_TYPES: { type: PostType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'media', label: 'Media', icon: Image },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'link', label: 'Link', icon: Link2 },
  { type: 'poll', label: 'Poll', icon: MessageCircle },
]

type PollOptionDraft = {
  id: string
  value: string
}

export default function Posts() {
  const pollOptionSeedRef = useRef(0)
  const createPollOption = useCallback((value = ''): PollOptionDraft => {
    pollOptionSeedRef.current += 1
    return {
      id: `poll-option-${pollOptionSeedRef.current}`,
      value,
    }
  }, [])
  const [newPostType, setNewPostType] = useState<PostType>('text')
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostImageFile, setNewPostImageFile] = useState<File | null>(null)
  const [newPostImagePreview, setNewPostImagePreview] = useState('')
  const [newPostLinkUrl, setNewPostLinkUrl] = useState('')
  const [newPostYoutubeUrl, setNewPostYoutubeUrl] = useState('')
  const [newPollQuestion, setNewPollQuestion] = useState('')
  const [newPollOptions, setNewPollOptions] = useState<PollOptionDraft[]>([
    createPollOption(),
    createPollOption(),
  ])
  const [isExpandingPost, setIsExpandingPost] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const isAuthenticated = useIsAuthenticated()
  const currentUser = getCurrentUser()
  const navigate = useNavigate()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfinitePosts(10)
  const createPostMutation = useCreatePost()
  const likePostMutation = useLikePost()
  const reportPostMutation = useReportPost()
  const deletePostMutation = useDeletePost()
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null)
  const [editingPostId, setEditingPostId] = useState<number | null>(null)
  const [editingPostTitle, setEditingPostTitle] = useState('')
  const [editingPostContent, setEditingPostContent] = useState('')
  const [openMenuPostId, setOpenMenuPostId] = useState<number | null>(null)
  const [reportingPostId, setReportingPostId] = useState<number | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [likingPostId, setLikingPostId] = useState<number | null>(null)

  // Close post action menu on click outside (H5)
  useEffect(() => {
    if (openMenuPostId === null) return
    const handleClickOutside = () => setOpenMenuPostId(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openMenuPostId])

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

  useEffect(() => {
    if (!newPostImageFile) {
      setNewPostImagePreview('')
      return
    }
    const objectURL = URL.createObjectURL(newPostImageFile)
    setNewPostImagePreview(objectURL)
    return () => {
      URL.revokeObjectURL(objectURL)
    }
  }, [newPostImageFile])

  const canSubmitNewPost = () => {
    switch (newPostType) {
      case 'media':
        return Boolean(newPostImageFile)
      case 'video':
        return Boolean(newPostYoutubeUrl.trim())
      case 'link':
        return Boolean(newPostLinkUrl.trim())
      case 'poll':
        return (
          Boolean(newPollQuestion.trim()) &&
          newPollOptions.filter(option => option.value.trim()).length >= 2
        )
      default:
        return Boolean(newPostContent.trim())
    }
  }

  const handleNewPost = async () => {
    if (!canSubmitNewPost()) return

    const title =
      newPostType === 'text'
        ? newPostTitle.trim() || `${currentUser?.username}'s Post`
        : currentUser?.username || 'Post'
    let content = newPostContent.trim()
    if (newPostType === 'poll') content = newPollQuestion

    let uploadedImageURL: string | undefined
    if (newPostType === 'media' && newPostImageFile) {
      try {
        setIsUploadingImage(true)
        const uploaded = await apiClient.uploadImage(newPostImageFile)
        uploadedImageURL = normalizeImageURL(uploaded.url)
      } catch (error) {
        setIsUploadingImage(false)
        if (!handleAuthOrFKError(error)) {
          logger.error('Failed to upload image:', error)
        }
        return
      }
      setIsUploadingImage(false)
    }

    const payload = {
      title,
      content: content || '',
      post_type: newPostType,
      image_url: uploadedImageURL,
      link_url:
        newPostType === 'link' && newPostLinkUrl.trim()
          ? newPostLinkUrl.trim()
          : undefined,
      youtube_url:
        newPostType === 'video' && newPostYoutubeUrl.trim()
          ? newPostYoutubeUrl.trim()
          : undefined,
      poll:
        newPostType === 'poll'
          ? {
              question: newPollQuestion.trim(),
              options: newPollOptions
                .map(option => option.value.trim())
                .filter(Boolean),
            }
          : undefined,
    }

    try {
      await createPostMutation.mutateAsync(payload)
      setNewPostTitle('')
      setNewPostContent('')
      setNewPostImageFile(null)
      setNewPostImagePreview('')
      setNewPostLinkUrl('')
      setNewPostYoutubeUrl('')
      setNewPollQuestion('')
      setNewPollOptions([createPollOption(), createPollOption()])
      setIsExpandingPost(false)
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    } catch (error) {
      if (!handleAuthOrFKError(error)) {
        logger.error('Failed to create post:', error)
        toast.error('Failed to create post. Please try again.')
      }
    }
  }

  const handleLikeToggle = (post: Post) => {
    console.log(
      'handleLikeToggle called for post:',
      post.id,
      'isAuthenticated:',
      isAuthenticated,
      'likingPostId:',
      likingPostId
    )

    if (likingPostId === post.id) {
      console.log('Already liking this post, returning')
      return // Prevent double-clicks
    }

    setLikingPostId(post.id)
    console.log('Calling likePostMutation.mutate for post:', post.id)
    // Backend now handles toggle logic automatically
    likePostMutation.mutate(post.id, {
      onSuccess: data => {
        console.log('Like toggle success:', data)
        setLikingPostId(null)
      },
      onError: error => {
        console.error('Like toggle error:', error)
        setLikingPostId(null)
        logger.error('Failed to toggle like:', error)
      },
    })
  }

  const cancelEditPost = () => {
    setEditingPostId(null)
    setEditingPostTitle('')
    setEditingPostContent('')
  }

  const saveEditPost = async (postId: number) => {
    if (!editingPostContent.trim()) return
    try {
      const updatePayload: UpdatePostRequest = {
        content: editingPostContent,
      }
      if (editingPostTitle.trim()) updatePayload.title = editingPostTitle

      await apiClient.updatePost(postId, updatePayload)
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      cancelEditPost()
    } catch (err) {
      logger.error('Failed to update post:', err)
    }
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-6'>
        <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
      </div>
    )
  }

  return (
    <div className='flex-1 overflow-y-auto py-8'>
      <div className='max-w-3xl mx-auto px-4'>
        {/* Create Post */}
        {isAuthenticated && (
          <Card className='mb-6 overflow-hidden border bg-card/95 shadow-sm hover:shadow-md transition-shadow rounded-2xl'>
            <CardContent className='p-5'>
              <div className='flex gap-3 mb-4'>
                <Avatar className='w-10 h-10 ring-2 ring-primary/5'>
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
                <div className='flex-1 space-y-3'>
                  {!isExpandingPost ? (
                    <button
                      type='button'
                      onClick={() => setIsExpandingPost(true)}
                      className={cn(
                        'w-full text-left bg-muted px-4 py-2.5 rounded-3xl transition-all hover:bg-muted/80 text-[15px] text-muted-foreground'
                      )}
                    >
                      {`What's on your mind, ${currentUser?.username}?`}
                    </button>
                  ) : (
                    <>
                      <div className='flex gap-2 flex-wrap'>
                        {POST_TYPES.map(({ type, label, icon: Icon }) => (
                          <Button
                            key={type}
                            type='button'
                            variant={
                              newPostType === type ? 'secondary' : 'ghost'
                            }
                            size='sm'
                            className='gap-1.5'
                            onClick={() => setNewPostType(type)}
                          >
                            <Icon className='w-4 h-4' />
                            {label}
                          </Button>
                        ))}
                      </div>

                      {newPostType === 'text' && (
                        <input
                          type='text'
                          placeholder='Title (optional)...'
                          value={newPostTitle}
                          onChange={e => setNewPostTitle(e.target.value)}
                          className='w-full text-sm font-semibold bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40'
                        />
                      )}

                      {newPostType === 'text' && (
                        <PostComposerEditor
                          value={newPostContent}
                          onChange={setNewPostContent}
                          placeholder='Write your post...'
                          disabled={createPostMutation.isPending}
                          minRows={4}
                        />
                      )}

                      {newPostType === 'media' && (
                        <>
                          <PostComposerEditor
                            value={newPostContent}
                            onChange={setNewPostContent}
                            placeholder='Caption (optional)...'
                            disabled={createPostMutation.isPending}
                            minRows={3}
                          />
                          <input
                            type='file'
                            accept='image/jpeg,image/png,image/gif,image/webp'
                            onChange={e =>
                              setNewPostImageFile(
                                e.target.files?.[0] ? e.target.files[0] : null
                              )
                            }
                            className='w-full text-sm bg-muted/30 px-4 py-2 rounded-xl focus:outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium'
                          />
                          {newPostImagePreview && (
                            <img
                              src={newPostImagePreview}
                              alt='Upload preview'
                              className='max-h-56 w-auto rounded-xl border border-border object-contain'
                            />
                          )}
                        </>
                      )}

                      {newPostType === 'video' && (
                        <>
                          <input
                            type='url'
                            placeholder='YouTube URL (required)...'
                            value={newPostYoutubeUrl}
                            onChange={e => setNewPostYoutubeUrl(e.target.value)}
                            className='w-full text-sm bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40'
                          />
                          <Textarea
                            placeholder='Caption (optional)...'
                            value={newPostContent}
                            onChange={e => setNewPostContent(e.target.value)}
                            className='min-h-16 resize-none bg-muted/30'
                            disabled={createPostMutation.isPending}
                          />
                        </>
                      )}

                      {newPostType === 'link' && (
                        <>
                          <input
                            type='url'
                            placeholder='Link URL (required)...'
                            value={newPostLinkUrl}
                            onChange={e => setNewPostLinkUrl(e.target.value)}
                            className='w-full text-sm bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40'
                          />
                          <Textarea
                            placeholder='Description (optional)...'
                            value={newPostContent}
                            onChange={e => setNewPostContent(e.target.value)}
                            className='min-h-16 resize-none bg-muted/30'
                            disabled={createPostMutation.isPending}
                          />
                        </>
                      )}

                      {newPostType === 'poll' && (
                        <div className='space-y-2'>
                          <input
                            type='text'
                            placeholder='Poll question (required)...'
                            value={newPollQuestion}
                            onChange={e => setNewPollQuestion(e.target.value)}
                            className='w-full text-sm font-medium bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40'
                          />
                          <div className='space-y-1.5'>
                            {newPollOptions.map((opt, i) => (
                              <div
                                key={opt.id}
                                className='flex gap-2 items-center'
                              >
                                <input
                                  type='text'
                                  placeholder={`Option ${i + 1}`}
                                  value={opt.value}
                                  onChange={e => {
                                    const next = [...newPollOptions]
                                    next[i] = {
                                      ...next[i],
                                      value: e.target.value,
                                    }
                                    setNewPollOptions(next)
                                  }}
                                  className='flex-1 text-sm bg-muted/30 px-4 py-2 rounded-xl focus:outline-none placeholder:text-muted-foreground/40'
                                />
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='sm'
                                  className='shrink-0'
                                  onClick={() => {
                                    if (newPollOptions.length > 2) {
                                      setNewPollOptions(
                                        newPollOptions.filter(
                                          option => option.id !== opt.id
                                        )
                                      )
                                    }
                                  }}
                                  disabled={newPollOptions.length <= 2}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={() =>
                                setNewPollOptions([
                                  ...newPollOptions,
                                  createPollOption(),
                                ])
                              }
                            >
                              Add option
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className='flex justify-between items-center pt-2'>
                        <Button
                          variant='ghost'
                          size='sm'
                          type='button'
                          onClick={() => setIsExpandingPost(false)}
                          className='text-xs font-semibold text-muted-foreground'
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleNewPost}
                          size='sm'
                          disabled={
                            !canSubmitNewPost() ||
                            createPostMutation.isPending ||
                            isUploadingImage
                          }
                          className='rounded-full px-6 shadow-sm'
                        >
                          {createPostMutation.isPending || isUploadingImage ? (
                            <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                          ) : (
                            <Send className='w-4 h-4 mr-2' />
                          )}
                          {isUploadingImage ? 'Uploading...' : 'Post'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isExpandingPost && (
                <div className='flex border-t pt-3 justify-around flex-wrap gap-1'>
                  {POST_TYPES.map(({ type, label, icon: Icon }) => (
                    <Button
                      key={type}
                      variant='ghost'
                      size='sm'
                      className='gap-2 text-muted-foreground flex-1 min-w-0 hover:bg-muted'
                      onClick={() => {
                        setNewPostType(type)
                        setIsExpandingPost(true)
                      }}
                    >
                      <Icon className='w-4 h-4 shrink-0' />
                      <span className='text-xs font-semibold truncate'>
                        {label}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Posts Feed */}
        <div className='space-y-6'>
          {posts.map(post => (
            <Card
              key={post.id}
              role='button'
              tabIndex={0}
              onClick={() => navigate(`/posts/${post.id}`)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/posts/${post.id}`)
                }
              }}
              className='border bg-card/95 shadow-sm rounded-2xl overflow-hidden text-sm transition-shadow hover:shadow-md cursor-pointer'
            >
              <div className='flex items-center justify-between px-4 py-3'>
                <div className='flex items-center gap-3'>
                  {post.user && (
                    <UserMenu user={post.user}>
                      <button
                        type='button'
                        className='flex items-center gap-3 text-left'
                        onClick={event => event.stopPropagation()}
                      >
                        <Avatar className='w-8 h-8 cursor-pointer ring-1 ring-border'>
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
                        <span className='font-semibold text-sm cursor-pointer'>
                          {post.user.username}
                        </span>
                      </button>
                    </UserMenu>
                  )}
                </div>
                {currentUser && currentUser.id !== post.user_id && (
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-8 w-8 p-0 text-muted-foreground hover:text-destructive'
                    onClick={event => {
                      event.stopPropagation()
                      setReportingPostId(post.id)
                      setReportReason('')
                      setReportDetails('')
                    }}
                    title='Report post'
                  >
                    <Flag className='h-4 w-4' />
                  </Button>
                )}
                {currentUser && currentUser.id === post.user_id && (
                  <div className='flex gap-2 relative'>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-8 w-8 p-0'
                      onClick={event => {
                        event.stopPropagation()
                        setOpenMenuPostId(prev =>
                          prev === post.id ? null : post.id
                        )
                      }}
                      aria-expanded={openMenuPostId === post.id}
                      aria-haspopup='menu'
                    >
                      <span className='sr-only'>Post actions</span>
                      <svg
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        width='16'
                        height='16'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      >
                        <circle cx='12' cy='12' r='1' />
                        <circle cx='19' cy='12' r='1' />
                        <circle cx='5' cy='12' r='1' />
                      </svg>
                    </Button>

                    {openMenuPostId === post.id && (
                      <div
                        role='menu'
                        className='absolute right-0 top-9 z-20 w-36 bg-card border border-border rounded-md shadow-lg'
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                      >
                        <button
                          type='button'
                          role='menuitem'
                          className='w-full text-left px-3 py-2 hover:bg-muted'
                          onClick={() => {
                            setOpenMenuPostId(null)
                            navigate(`/posts/${post.id}/edit`)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type='button'
                          role='menuitem'
                          className='w-full text-left px-3 py-2 text-destructive hover:bg-muted'
                          onClick={() => {
                            setOpenMenuPostId(null)
                            setDeletingPostId(post.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Post Media / Content */}
              <div className='px-4 pb-3'>
                {editingPostId === post.id ? (
                  <div className='p-4 bg-muted/30 rounded-xl border border-border/60 space-y-4'>
                    {post.post_type === 'text' && (
                      <input
                        type='text'
                        value={editingPostTitle}
                        onChange={e => setEditingPostTitle(e.target.value)}
                        className='w-full font-bold bg-transparent border-none focus:ring-0 p-0 text-base'
                        placeholder='Title'
                      />
                    )}
                    <Textarea
                      value={editingPostContent}
                      onChange={e => setEditingPostContent(e.target.value)}
                      className='min-h-25 border-none focus-visible:ring-0 p-0 -ml-1 resize-none'
                    />
                    <div className='flex justify-end gap-2 pt-2'>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={cancelEditPost}
                      >
                        Cancel
                      </Button>
                      <Button size='sm' onClick={() => saveEditPost(post.id)}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : post.youtube_url ? (
                  <div className='space-y-2'>
                    <YouTubeEmbed url={post.youtube_url} />
                    {post.content ? (
                      <div className='p-4 bg-muted/30 rounded-xl border border-border/60'>
                        <PostCaption content={post.content} />
                      </div>
                    ) : null}
                  </div>
                ) : post.link_url ? (
                  <div className='space-y-2'>
                    <LinkCard url={post.link_url} title={post.title} />
                    {post.content ? (
                      <div className='p-4 bg-muted/30 rounded-xl border border-border/60'>
                        <PostCaption content={post.content} />
                      </div>
                    ) : null}
                  </div>
                ) : post.poll ? (
                  <div className='space-y-2'>
                    <PollBlock
                      poll={post.poll}
                      postId={post.id}
                      onVoteClick={e => {
                        e.stopPropagation()
                        navigate(`/posts/${post.id}`)
                      }}
                    />
                  </div>
                ) : post.image_url ? (
                  <div className='space-y-2'>
                    <ResponsiveImage
                      variants={post.image_variants}
                      fallbackUrl={post.image_url}
                      alt={`Post by ${post.user?.username}`}
                      sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 640px'
                      cropMode={post.image_crop_mode}
                      loading='lazy'
                    />
                    {post.content ? (
                      <PostCaption content={post.content} />
                    ) : null}
                  </div>
                ) : (
                  <div className='p-4 bg-muted/30 rounded-xl border border-border/60'>
                    <PostCaption title={post.title} content={post.content} />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className='px-4 pt-1 pb-4 grid gap-1'>
                <div className='flex items-center gap-4'>
                  <button
                    type='button'
                    onClick={event => {
                      event.stopPropagation()
                      handleLikeToggle(post)
                    }}
                    className='hover:opacity-70 transition-opacity'
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
                    type='button'
                    onClick={event => {
                      event.stopPropagation()
                      navigate(`/posts/${post.id}`)
                    }}
                    className='hover:opacity-70 transition-opacity'
                  >
                    <MessageCircle className='w-6 h-6 -rotate-90' />
                  </button>
                  <button
                    className='hover:opacity-70 transition-opacity ml-auto'
                    type='button'
                    onClick={event => event.stopPropagation()}
                  >
                    <span className='sr-only'>Share</span>
                    <svg
                      aria-hidden='true'
                      xmlns='http://www.w3.org/2000/svg'
                      width='24'
                      height='24'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      className='w-6 h-6'
                    >
                      <path d='M5 12h14' />
                      <path d='m12 5 7 7-7 7' />
                    </svg>
                  </button>
                </div>

                {/* Likes Count */}
                <div className='font-semibold text-sm mt-1'>
                  {post.likes_count} likes
                </div>

                {/* Caption handled above for media/link/poll/text */}

                {/* Comments Link */}
                <button
                  type='button'
                  className='text-muted-foreground text-sm text-left mt-1 hover:text-foreground'
                  onClick={event => {
                    event.stopPropagation()
                    navigate(`/posts/${post.id}`)
                  }}
                >
                  {(post.comments_count ?? 0) > 0
                    ? `View all ${post.comments_count} comments`
                    : 'Add a comment...'}
                </button>
                <p className='text-[10px] text-muted-foreground bg-transparent uppercase tracking-wider mt-1'>
                  {formatDistanceToNow(new Date(post.created_at), {
                    addSuffix: false,
                  })}{' '}
                  AGO
                </p>
              </div>
            </Card>
          ))}

          {/* Delete confirmation dialog */}
          <Dialog
            open={!!deletingPostId}
            onOpenChange={open => {
              if (!open) setDeletingPostId(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete post?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. Are you sure you want to delete
                  this post?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='ghost' onClick={() => setDeletingPostId(null)}>
                  Cancel
                </Button>
                <Button
                  className='text-destructive'
                  onClick={async () => {
                    if (!deletingPostId) return
                    try {
                      await deletePostMutation.mutateAsync(deletingPostId)
                      setDeletingPostId(null)
                    } catch (err) {
                      logger.error('Failed to delete post:', err)
                    }
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Report post dialog */}
          <Dialog
            open={!!reportingPostId}
            onOpenChange={open => {
              if (!open) setReportingPostId(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Report post</DialogTitle>
                <DialogDescription>
                  Please provide a reason for reporting this post.
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-3'>
                <Textarea
                  placeholder='Reason for reporting (required)...'
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                  rows={2}
                />
                <Textarea
                  placeholder='Additional details (optional)...'
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  rows={2}
                />
              </div>
              <DialogFooter>
                <Button
                  variant='ghost'
                  onClick={() => setReportingPostId(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!reportReason.trim()}
                  onClick={() => {
                    if (!reportingPostId || !reportReason.trim()) return
                    reportPostMutation.mutate({
                      postId: reportingPostId,
                      payload: {
                        reason: reportReason.trim(),
                        details: reportDetails.trim() || undefined,
                      },
                    })
                    setReportingPostId(null)
                  }}
                >
                  Submit Report
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Loading indicator for infinite scroll */}
          {isFetchingNextPage && (
            <div className='flex justify-center py-4'>
              <Loader2 className='w-6 h-6 animate-spin text-muted-foreground' />
            </div>
          )}
          {/* End of feed */}
          {!hasNextPage && posts.length > 0 && (
            <div className='flex justify-center py-8 text-muted-foreground'>
              <div className='w-2 h-2 rounded-full bg-border' />
            </div>
          )}

          {/* Empty state */}
          {posts.length === 0 && (
            <div className='text-center py-20'>
              <div className='w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-6'>
                <Image className='w-10 h-10 text-muted-foreground' />
              </div>
              <h3 className='font-bold text-lg mb-2'>No Posts Yet</h3>
              <p className='text-muted-foreground'>
                Start capturing your moments to see them here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
