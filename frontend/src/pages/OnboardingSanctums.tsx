import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useSanctums, useUpsertMySanctumMemberships } from '@/hooks/useSanctums'

const MOBILE_CARDS_PER_PAGE = 4

export default function OnboardingSanctums() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: sanctums = [], isLoading, isError } = useSanctums()
  const upsert = useUpsertMySanctumMemberships()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  const sortedSanctums = useMemo(
    () => [...sanctums].sort((a, b) => a.name.localeCompare(b.name)),
    [sanctums]
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const selectedSlugs = useMemo(
    () =>
      sortedSanctums
        .map(sanctum => sanctum.slug)
        .filter(slug => selected.has(slug)),
    [selected, sortedSanctums]
  )

  const totalPages = isMobile
    ? Math.max(1, Math.ceil(sortedSanctums.length / MOBILE_CARDS_PER_PAGE))
    : 1
  const start = isMobile ? page * MOBILE_CARDS_PER_PAGE : 0
  const end = isMobile ? start + MOBILE_CARDS_PER_PAGE : sortedSanctums.length
  const visibleSanctums = sortedSanctums.slice(start, end)

  const toggle = (slug: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  const onSubmit = async () => {
    try {
      await upsert.mutateAsync({ sanctum_slugs: selectedSlugs })
      toast.success('Your sanctums are ready.')
      navigate('/')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save sanctum choices'
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className='mx-auto max-w-3xl p-6'>
        <p className='text-sm text-muted-foreground'>Loading sanctums...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='mx-auto max-w-3xl p-6'>
        <p className='text-sm text-destructive'>
          Failed to load sanctums. Refresh and try again.
        </p>
      </div>
    )
  }

  return (
    <div className='h-[calc(100dvh-9rem)] px-4 py-3 md:h-[calc(100dvh-5rem)] md:px-6 md:py-5'>
      <div className='mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xl backdrop-blur-xl md:p-4'>
        <div>
          <h1 className='text-xl font-semibold tracking-tight md:text-2xl'>
            Choose your Sanctums
          </h1>
          <p className='text-sm text-muted-foreground'>
            Select sanctums you want to follow. You can skip and use the main
            feed.
          </p>
        </div>

        <div className='mt-2 min-h-0 flex-1 overflow-hidden'>
          <div
            className={`grid gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${
              isMobile ? 'h-full' : ''
            }`}
            style={{
              gridTemplateRows: isMobile
                ? 'repeat(4, minmax(0, 1fr))'
                : undefined,
            }}
          >
            {visibleSanctums.map(sanctum => {
              const checked = selected.has(sanctum.slug)
              return (
                <button
                  key={sanctum.id}
                  type='button'
                  aria-pressed={checked}
                  aria-label={`Toggle ${sanctum.name}`}
                  onClick={() => toggle(sanctum.slug)}
                  className={`flex ${
                    isMobile
                      ? 'h-full flex-col justify-between'
                      : 'min-h-[3rem] flex-col'
                  } rounded-xl border px-2 py-1.5 text-left transition-colors ${
                    checked
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border/70 bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className='flex items-start justify-between gap-2'>
                    <p className='line-clamp-1 text-xs font-semibold md:text-sm'>
                      {sanctum.name}
                    </p>
                    <span
                      aria-hidden='true'
                      className={`mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border text-[10px] font-semibold ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 text-muted-foreground'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                  </div>
                  <p className='mt-0.5 line-clamp-1 text-[11px] text-muted-foreground'>
                    {sanctum.description || 'No description'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        <div className='mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3'>
          <div className='flex items-center gap-2'>
            {isMobile && (
              <>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className='text-xs text-muted-foreground'>
                  {page + 1} / {totalPages}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setPage(prev => Math.min(prev + 1, totalPages - 1))
                  }
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </>
            )}
          </div>
          <div className='flex items-center gap-3'>
            <p className='text-xs text-muted-foreground md:text-sm'>
              Selected: {selectedSlugs.length}
            </p>
            <Button onClick={onSubmit} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
