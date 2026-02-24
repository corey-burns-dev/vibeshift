import type { PostSort } from '@/api/types'
import { cn } from '@/lib/utils'

const SORT_OPTIONS: { value: PostSort; label: string; title: string }[] = [
  { value: 'new', label: 'New', title: 'Newest posts first' },
  { value: 'hot', label: 'Hot', title: 'Trending by engagement and recency' },
  { value: 'top', label: 'Top', title: 'Most liked posts' },
  {
    value: 'rising',
    label: 'Rising',
    title: 'Fast-growing posts in the last 48 hours',
  },
  { value: 'best', label: 'Best', title: 'Highest combined score' },
]

interface PostSortBarProps {
  sort: PostSort
  onChange: (sort: PostSort) => void
  className?: string
}

export function PostSortBar({ sort, onChange, className }: PostSortBarProps) {
  return (
    <fieldset
      className={cn(
        'flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1',
        className
      )}
    >
      <legend className='sr-only'>Sort posts</legend>
      {SORT_OPTIONS.map(option => (
        <button
          key={option.value}
          type='button'
          title={option.title}
          aria-pressed={sort === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            sort === option.value
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  )
}
