import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
      <div className='mx-auto flex h-full max-w-5xl flex-col rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xl backdrop-blur-xl md:p-5'>
        <div>
          <h1 className='text-xl font-semibold tracking-tight md:text-2xl'>
            Choose your Sanctums
          </h1>
          <p className='text-sm text-muted-foreground'>
            Select sanctums you want to follow. You can skip and use the main
            feed.
          </p>
        </div>

        <div className='mt-3 min-h-0 flex-1 overflow-hidden'>
          <div
            className='grid h-full gap-3 sm:grid-cols-2'
            style={{
              gridTemplateRows: isMobile ? 'repeat(4, minmax(0, 1fr))' : 'auto',
            }}
          >
            {visibleSanctums.map(sanctum => {
              const checked = selected.has(sanctum.slug)
              return (
                <Card
                  key={sanctum.id}
                  className='flex h-full flex-col justify-between border-border/70'
                >
                  <CardHeader className='pb-2'>
                    <CardTitle className='line-clamp-1 text-sm md:text-base'>
                      {sanctum.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-2'>
                    <p className='line-clamp-2 text-xs text-muted-foreground md:text-sm'>
                      {sanctum.description || 'No description'}
                    </p>
                    <div className='flex items-center gap-2'>
                      <input
                        className='h-4 w-4 rounded border-input'
                        type='checkbox'
                        id={`sanctum-${sanctum.slug}`}
                        checked={checked}
                        onChange={() => toggle(sanctum.slug)}
                      />
                      <Label htmlFor={`sanctum-${sanctum.slug}`}>
                        Join sanctum
                      </Label>
                    </div>
                  </CardContent>
                </Card>
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
