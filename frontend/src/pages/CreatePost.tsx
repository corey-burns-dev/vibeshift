import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import type { PostType } from '@/api/types'
import { PostComposerEditor } from '@/components/posts/PostComposerEditor'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useCreatePost } from '@/hooks/usePosts'
import { useSanctums } from '@/hooks/useSanctums'
import { getCurrentUser } from '@/hooks/useUsers'
import { normalizeImageURL } from '@/lib/mediaUrl'

const POST_TYPES: PostType[] = ['text', 'media', 'video', 'link', 'poll']

export default function CreatePost() {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const createPost = useCreatePost()
  const { data: sanctums = [] } = useSanctums()

  const [postType, setPostType] = useState<PostType>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [linkURL, setLinkURL] = useState('')
  const [youtubeURL, setYoutubeURL] = useState('')
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<
    { id: string; value: string }[]
  >([
    { id: crypto.randomUUID(), value: '' },
    { id: crypto.randomUUID(), value: '' },
  ])
  const [target, setTarget] = useState<'main' | number>('main')
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('')
      return
    }
    const objectURL = URL.createObjectURL(imageFile)
    setImagePreview(objectURL)
    return () => URL.revokeObjectURL(objectURL)
  }, [imageFile])

  const canSubmit = () => {
    switch (postType) {
      case 'media':
        return Boolean(imageFile)
      case 'video':
        return Boolean(youtubeURL.trim())
      case 'link':
        return Boolean(linkURL.trim())
      case 'poll':
        return (
          Boolean(pollQuestion.trim()) &&
          pollOptions.filter(option => option.value.trim()).length >= 2
        )
      default:
        return Boolean(content.trim())
    }
  }

  const onSubmit = async () => {
    if (!canSubmit()) return

    let uploadedImageURL: string | undefined
    if (postType === 'media' && imageFile) {
      setIsUploadingImage(true)
      try {
        const uploaded = await apiClient.uploadImage(imageFile)
        uploadedImageURL = normalizeImageURL(uploaded.url)
      } catch (_err) {
        toast.error('Image upload failed. Please try again.')
        return
      } finally {
        setIsUploadingImage(false)
      }
    }

    const resolvedTitle =
      postType === 'text'
        ? title.trim() || `${currentUser?.username || 'User'}'s Post`
        : currentUser?.username || 'Post'

    const payload = {
      title: resolvedTitle,
      content: postType === 'poll' ? pollQuestion.trim() : content.trim(),
      post_type: postType,
      sanctum_id: target === 'main' ? undefined : target,
      image_url: uploadedImageURL,
      link_url: postType === 'link' ? linkURL.trim() : undefined,
      youtube_url: postType === 'video' ? youtubeURL.trim() : undefined,
      poll:
        postType === 'poll'
          ? {
              question: pollQuestion.trim(),
              options: pollOptions
                .map(option => option.value.trim())
                .filter(Boolean),
            }
          : undefined,
    }

    const created = await createPost.mutateAsync(payload)
    navigate(`/posts/${created.id}`)
  }

  return (
    <div className='mx-auto w-full max-w-3xl px-4 py-6'>
      <Card className='rounded-2xl border border-border/70 bg-card/90 shadow-sm'>
        <CardContent className='space-y-4 p-5'>
          <h1 className='text-xl font-semibold'>Create Post</h1>

          <div className='grid gap-1'>
            <label
              htmlFor='post-target'
              className='text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'
            >
              Post destination
            </label>
            <select
              id='post-target'
              value={target === 'main' ? 'main' : String(target)}
              onChange={event => {
                const value = event.target.value
                setTarget(value === 'main' ? 'main' : Number(value))
              }}
              className='rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground dark:[color-scheme:dark]'
            >
              <option value='main' className='bg-background text-foreground'>
                Main feed (no sanctum)
              </option>
              {sanctums.map(sanctum => (
                <option
                  key={sanctum.id}
                  value={sanctum.id}
                  className='bg-background text-foreground'
                >
                  {sanctum.name}
                </option>
              ))}
            </select>
          </div>

          <div className='flex flex-wrap gap-2'>
            {POST_TYPES.map(type => (
              <Button
                key={type}
                type='button'
                size='sm'
                variant={postType === type ? 'secondary' : 'outline'}
                onClick={() => setPostType(type)}
              >
                {type}
              </Button>
            ))}
          </div>

          {postType === 'text' && (
            <input
              type='text'
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder='Title (optional)'
              className='w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm'
            />
          )}

          {(postType === 'text' || postType === 'media') && (
            <PostComposerEditor
              value={content}
              onChange={setContent}
              minRows={4}
              placeholder='Write your post...'
            />
          )}

          {postType === 'media' && (
            <div className='space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/20 p-3'>
              <p className='text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'>
                Upload image
              </p>
              <input
                type='file'
                accept='image/jpeg,image/png,image/gif,image/webp'
                onChange={event =>
                  setImageFile(event.target.files?.[0] ?? null)
                }
                className='w-full cursor-pointer rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground'
              />
              <p className='text-xs text-muted-foreground'>
                Choose an image file to attach to your post.
              </p>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt='Upload preview'
                  className='max-h-72 rounded-xl border border-border object-contain'
                />
              )}
            </div>
          )}

          {postType === 'video' && (
            <>
              <input
                type='url'
                value={youtubeURL}
                onChange={event => setYoutubeURL(event.target.value)}
                placeholder='YouTube URL'
                className='w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm'
              />
              <Textarea
                value={content}
                onChange={event => setContent(event.target.value)}
                placeholder='Caption (optional)'
              />
            </>
          )}

          {postType === 'link' && (
            <>
              <input
                type='url'
                value={linkURL}
                onChange={event => setLinkURL(event.target.value)}
                placeholder='Link URL'
                className='w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm'
              />
              <Textarea
                value={content}
                onChange={event => setContent(event.target.value)}
                placeholder='Description (optional)'
              />
            </>
          )}

          {postType === 'poll' && (
            <div className='space-y-2'>
              <input
                type='text'
                value={pollQuestion}
                onChange={event => setPollQuestion(event.target.value)}
                placeholder='Poll question'
                className='w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm'
              />
              {pollOptions.map((option, index) => (
                <input
                  key={option.id}
                  type='text'
                  value={option.value}
                  onChange={event =>
                    setPollOptions(prev => {
                      const next = [...prev]
                      next[index] = {
                        ...next[index],
                        value: event.target.value,
                      }
                      return next
                    })
                  }
                  placeholder={`Option ${index + 1}`}
                  className='w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm'
                />
              ))}
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() =>
                  setPollOptions(prev => [
                    ...prev,
                    { id: crypto.randomUUID(), value: '' },
                  ])
                }
              >
                Add option
              </Button>
            </div>
          )}

          <div className='flex justify-end gap-2'>
            <Button type='button' variant='ghost' onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={
                !canSubmit() || createPost.isPending || isUploadingImage
              }
            >
              {createPost.isPending || isUploadingImage ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : null}
              {isUploadingImage ? 'Uploading...' : 'Create post'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
