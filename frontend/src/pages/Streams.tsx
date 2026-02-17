import { Eye, Filter, Radio, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Stream } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateStream,
  useStreamCategories,
  useStreams,
} from '@/hooks/useStreams'
import { cn } from '@/lib/utils'

function StreamCard({ stream }: { stream: Stream }) {
  return (
    <Link
      to={`/streams/${stream.id}`}
      className='group block rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10'
    >
      {/* Thumbnail */}
      <div className='relative aspect-video bg-muted overflow-hidden'>
        {stream.thumbnail_url ? (
          <img
            src={stream.thumbnail_url}
            alt={stream.title}
            className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'
          />
        ) : (
          <div className='w-full h-full bg-linear-to-br from-primary/20 to-primary/5 flex items-center justify-center'>
            <Radio className='w-12 h-12 text-primary/50' />
          </div>
        )}
        {/* Live badge */}
        {stream.is_live && (
          <Badge className='absolute top-2 left-2 bg-red-500 text-white border-0 animate-pulse'>
            <span className='w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse' />
            LIVE
          </Badge>
        )}
        {/* Viewer count */}
        <div className='absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1'>
          <Eye className='w-3 h-3' />
          {stream.viewer_count.toLocaleString()}
        </div>
        {/* Category */}
        {stream.category && (
          <Badge
            variant='secondary'
            className='absolute bottom-2 right-2 bg-black/70 text-white border-0'
          >
            {stream.category}
          </Badge>
        )}
      </div>
      {/* Info */}
      <div className='p-3 flex gap-3'>
        <Avatar className='w-10 h-10 shrink-0'>
          <AvatarImage src={stream.user?.avatar} />
          <AvatarFallback>
            {stream.user?.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className='flex-1 min-w-0'>
          <h3 className='font-semibold text-sm truncate group-hover:text-primary transition-colors'>
            {stream.title}
          </h3>
          <p className='text-xs text-muted-foreground truncate'>
            {stream.user?.username}
          </p>
        </div>
      </div>
    </Link>
  )
}

function GoLiveModal() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [streamType, setStreamType] = useState<
    'youtube' | 'twitch' | 'hls' | 'iframe'
  >('youtube')
  const [category, setCategory] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')

  const { data: categories = [] } = useStreamCategories()
  const createStream = useCreateStream()

  const handleSubmit = async () => {
    if (!title || !streamUrl) return

    try {
      const stream = await createStream.mutateAsync({
        title,
        description,
        stream_url: streamUrl,
        stream_type: streamType,
        category,
        thumbnail_url: thumbnailUrl,
      })
      setOpen(false)
      navigate(`/streams/${stream.id}`)
    } catch (error) {
      console.error('Failed to create stream:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className='gap-2'>
          <Radio className='w-4 h-4' />
          Go Live
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-125'>
        <DialogHeader>
          <DialogTitle>Create a Stream</DialogTitle>
          <DialogDescription>
            Set up your stream details. You can use YouTube, Twitch, or a custom
            HLS URL.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='title'>Title</Label>
            <Input
              id='title'
              placeholder='My awesome stream'
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='description'>Description</Label>
            <Textarea
              id='description'
              placeholder="What's your stream about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='stream-type'>Stream Type</Label>
              <Select
                value={streamType}
                onValueChange={(v: typeof streamType) => setStreamType(v)}
              >
                <SelectTrigger id='stream-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='youtube'>YouTube</SelectItem>
                  <SelectItem value='twitch'>Twitch</SelectItem>
                  <SelectItem value='hls'>HLS URL</SelectItem>
                  <SelectItem value='iframe'>Iframe Embed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='category'>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id='category'>
                  <SelectValue placeholder='Select...' />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='stream-url'>
              {streamType === 'youtube'
                ? 'YouTube Video ID or URL'
                : streamType === 'twitch'
                  ? 'Twitch Channel Name'
                  : streamType === 'hls'
                    ? 'HLS Stream URL (.m3u8)'
                    : 'Embed URL'}
            </Label>
            <Input
              id='stream-url'
              placeholder={
                streamType === 'youtube'
                  ? 'dQw4w9WgXcQ or https://youtube.com/watch?v=...'
                  : streamType === 'twitch'
                    ? 'ninja'
                    : 'https://...'
              }
              value={streamUrl}
              onChange={e => setStreamUrl(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='thumbnail'>Thumbnail URL (optional)</Label>
            <Input
              id='thumbnail'
              placeholder='https://...'
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title || !streamUrl || createStream.isPending}
          >
            {createStream.isPending ? 'Creating...' : 'Create Stream'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Streams() {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const { data: categories = [] } = useStreamCategories()
  const { data, isLoading } = useStreams(selectedCategory || undefined)

  const streams = data?.streams || []

  return (
    <div className='h-full overflow-y-auto'>
      <div className='max-w-7xl mx-auto p-6'>
        {/* Header */}
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold mb-2'>Live Streams</h1>
            <p className='text-muted-foreground'>
              Watch your favorite streamers live or start your own broadcast
            </p>
          </div>
          <GoLiveModal />
        </div>

        {/* Filter Bar */}
        <div className='flex items-center gap-4 mb-6'>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Filter className='w-4 h-4' />
            <span>Filter by:</span>
          </div>
          <div className='flex gap-2 flex-wrap'>
            <Badge
              variant={selectedCategory === '' ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer transition-all hover:scale-105',
                selectedCategory === '' && 'bg-primary'
              )}
              onClick={() => setSelectedCategory('')}
            >
              All
            </Badge>
            {categories.map(cat => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-all hover:scale-105',
                  selectedCategory === cat && 'bg-primary'
                )}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>

        {/* Stream Grid */}
        {isLoading ? (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i + 1}`}
                className='rounded-xl overflow-hidden bg-card border'
              >
                <div className='aspect-video bg-muted animate-pulse' />
                <div className='p-3 flex gap-3'>
                  <div className='w-10 h-10 rounded-full bg-muted animate-pulse' />
                  <div className='flex-1 space-y-2'>
                    <div className='h-4 bg-muted rounded animate-pulse' />
                    <div className='h-3 bg-muted rounded w-2/3 animate-pulse' />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className='text-center py-20'>
            <div className='w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center'>
              <Users className='w-10 h-10 text-muted-foreground' />
            </div>
            <h3 className='text-xl font-semibold mb-2'>
              No streams live right now
            </h3>
            <p className='text-muted-foreground mb-6'>
              Be the first to go live and share your content!
            </p>
            <GoLiveModal />
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {streams.map(stream => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
