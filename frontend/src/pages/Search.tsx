import { useQuery } from '@tanstack/react-query'
import { Landmark, Loader2, Search, User2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { getAvatarUrl } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

type Tab = 'all' | 'posts' | 'people' | 'sanctums'

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'posts', label: 'Posts' },
  { value: 'people', label: 'People' },
  { value: 'sanctums', label: 'Sanctums' },
]

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const initialTab = (searchParams.get('tab') as Tab) ?? 'all'

  const [inputValue, setInputValue] = useState(initialQ)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = useDebounce(inputValue.trim(), 300)

  // Keep URL in sync
  useEffect(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (q) next.set('q', q)
        else next.delete('q')
        if (activeTab !== 'all') next.set('tab', activeTab)
        else next.delete('tab')
        return next
      },
      { replace: true }
    )
  }, [q, activeTab, setSearchParams])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const enabled = q.length > 0

  const postsQuery = useQuery({
    queryKey: ['search', 'posts', q],
    queryFn: () => apiClient.searchPosts({ q, limit: 20 }),
    enabled: enabled && (activeTab === 'all' || activeTab === 'posts'),
    staleTime: 30_000,
  })

  const peopleQuery = useQuery({
    queryKey: ['search', 'people', q],
    queryFn: () => apiClient.searchUsers(q, 20),
    enabled: enabled && (activeTab === 'all' || activeTab === 'people'),
    staleTime: 30_000,
  })

  const sanctumsQuery = useQuery({
    queryKey: ['search', 'sanctums', q],
    queryFn: () => apiClient.searchSanctums(q),
    enabled: enabled && (activeTab === 'all' || activeTab === 'sanctums'),
    staleTime: 30_000,
  })

  const isLoading =
    (postsQuery.isFetching && (activeTab === 'all' || activeTab === 'posts')) ||
    (peopleQuery.isFetching &&
      (activeTab === 'all' || activeTab === 'people')) ||
    (sanctumsQuery.isFetching &&
      (activeTab === 'all' || activeTab === 'sanctums'))

  const posts = postsQuery.data ?? []
  const people = peopleQuery.data ?? []
  const sanctums = sanctumsQuery.data ?? []

  const showPosts = activeTab === 'all' || activeTab === 'posts'
  const showPeople = activeTab === 'all' || activeTab === 'people'
  const showSanctums = activeTab === 'all' || activeTab === 'sanctums'

  const noResults =
    enabled &&
    !isLoading &&
    (showPosts ? posts.length === 0 : true) &&
    (showPeople ? people.length === 0 : true) &&
    (showSanctums ? sanctums.length === 0 : true)

  return (
    <div className='mx-auto w-full max-w-2xl px-3 py-6 md:px-4'>
      {/* Search input */}
      <div className='relative mb-4'>
        <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <input
          ref={inputRef}
          type='search'
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder='Search posts, people, sanctums…'
          className='h-11 w-full rounded-xl border border-border/70 bg-card/80 pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
        />
        {isLoading && (
          <Loader2 className='absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground' />
        )}
      </div>

      {/* Tabs */}
      <div
        className='mb-5 flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1'
        role='tablist'
        aria-label='Search filters'
      >
        {TABS.map(tab => (
          <button
            key={tab.value}
            type='button'
            role='tab'
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              activeTab === tab.value
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty / prompt state */}
      {!enabled && (
        <div className='flex flex-col items-center gap-3 py-16 text-muted-foreground'>
          <Search className='h-10 w-10 opacity-30' />
          <p className='text-sm'>Start typing to search across Sanctum</p>
        </div>
      )}

      {noResults && (
        <div className='flex flex-col items-center gap-3 py-16 text-muted-foreground'>
          <Search className='h-10 w-10 opacity-30' />
          <p className='text-sm'>
            No results for{' '}
            <span className='font-semibold text-foreground'>"{q}"</span>
          </p>
        </div>
      )}

      <div className='space-y-6'>
        {/* Posts */}
        {showPosts && posts.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <h2 className='mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'>
                Posts
              </h2>
            )}
            <Card className='divide-y divide-border/50 rounded-2xl border border-border/70 bg-card/70'>
              {posts.map(post => (
                <Link
                  key={post.id}
                  to={`/posts/${post.id}`}
                  className='flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 first:rounded-t-2xl last:rounded-b-2xl'
                >
                  <span className='line-clamp-1 text-sm font-semibold text-foreground'>
                    {post.title || post.content.slice(0, 80)}
                  </span>
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    {post.sanctum_id && (
                      <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary'>
                        Sanctum
                      </span>
                    )}
                    <span>{post.user?.username}</span>
                    <span>·</span>
                    <span>{post.likes_count} likes</span>
                    {post.comments_count !== undefined && (
                      <>
                        <span>·</span>
                        <span>{post.comments_count} comments</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </Card>
            {activeTab === 'posts' && posts.length === 20 && (
              <p className='mt-2 text-center text-xs text-muted-foreground'>
                Showing first 20 results
              </p>
            )}
          </section>
        )}

        {/* People */}
        {showPeople && people.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <h2 className='mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'>
                People
              </h2>
            )}
            <Card className='divide-y divide-border/50 rounded-2xl border border-border/70 bg-card/70'>
              {people.map(user => (
                <Link
                  key={user.id}
                  to={`/users/${user.id}`}
                  className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 first:rounded-t-2xl last:rounded-b-2xl'
                >
                  <Avatar className='h-9 w-9 shrink-0'>
                    <AvatarImage
                      src={user.avatar || getAvatarUrl(user.username)}
                    />
                    <AvatarFallback>
                      <User2 className='h-4 w-4' />
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>
                      {user.username}
                    </p>
                    {user.bio && (
                      <p className='truncate text-xs text-muted-foreground'>
                        {user.bio}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </Card>
          </section>
        )}

        {/* Sanctums */}
        {showSanctums && sanctums.length > 0 && (
          <section>
            {activeTab === 'all' && (
              <h2 className='mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'>
                Sanctums
              </h2>
            )}
            <Card className='divide-y divide-border/50 rounded-2xl border border-border/70 bg-card/70'>
              {sanctums.map(sanctum => (
                <Link
                  key={sanctum.id}
                  to={`/s/${sanctum.slug}`}
                  className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 first:rounded-t-2xl last:rounded-b-2xl'
                >
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10'>
                    <Landmark className='h-4 w-4 text-primary' />
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>
                      {sanctum.name}
                    </p>
                    {sanctum.description && (
                      <p className='line-clamp-1 text-xs text-muted-foreground'>
                        {sanctum.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </Card>
          </section>
        )}
      </div>
    </div>
  )
}
