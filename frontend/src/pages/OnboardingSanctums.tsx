import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSanctums, useUpsertMySanctumMemberships } from '@/hooks/useSanctums'

export default function OnboardingSanctums() {
  const navigate = useNavigate()
  const { data: sanctums = [], isLoading, isError } = useSanctums()
  const upsert = useUpsertMySanctumMemberships()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sortedSanctums = useMemo(
    () => [...sanctums].sort((a, b) => a.name.localeCompare(b.name)),
    [sanctums]
  )

  const selectedSlugs = useMemo(
    () => sortedSanctums.map(s => s.slug).filter(slug => selected.has(slug)),
    [selected, sortedSanctums]
  )

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
      <div className='flex h-dvh items-center justify-center'>
        <p className='text-muted-foreground'>Loading sanctums...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex h-dvh items-center justify-center'>
        <p className='text-destructive'>
          Failed to load sanctums. Refresh and try again.
        </p>
      </div>
    )
  }

  return (
    <div className='flex h-dvh flex-col'>
      {/* Header */}
      <div className='shrink-0 border-b border-border/60 px-6 py-6 text-center'>
        <h1 className='text-3xl font-bold tracking-tight'>
          Find your communities
        </h1>
        <p className='mt-2 text-base text-muted-foreground'>
          Join sanctums that match your interests. You can always change these
          later.
        </p>
      </div>

      {/* Scrollable community grid */}
      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8'>
        <div className='mx-auto max-w-4xl'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {sortedSanctums.map(sanctum => {
              const joined = selected.has(sanctum.slug)
              return (
                <div
                  key={sanctum.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${
                    joined
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border bg-card hover:border-border/80 hover:bg-muted/30'
                  }`}
                >
                  {/* Icon + name */}
                  <div className='flex items-center gap-3'>
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                        joined
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {sanctum.name.charAt(0).toUpperCase()}
                    </div>
                    <p className='text-base font-semibold leading-snug'>
                      {sanctum.name}
                    </p>
                  </div>

                  {/* Description */}
                  <p className='line-clamp-2 min-h-10 text-sm text-muted-foreground'>
                    {sanctum.description || 'No description available.'}
                  </p>

                  {/* Join button */}
                  <button
                    type='button'
                    onClick={() => toggle(sanctum.slug)}
                    className={`w-full rounded-full py-1.5 text-sm font-semibold transition-colors ${
                      joined
                        ? 'bg-primary/15 text-primary hover:bg-primary/25'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {joined ? '✓ Joined' : '+ Join'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='shrink-0 border-t border-border/60 px-6 py-4'>
        <div className='mx-auto flex max-w-4xl items-center justify-between gap-4'>
          <p className='text-sm text-muted-foreground'>
            {selectedSlugs.length === 0
              ? 'No sanctums selected'
              : `${selectedSlugs.length} sanctum${selectedSlugs.length === 1 ? '' : 's'} selected`}
          </p>
          <div className='flex items-center gap-3'>
            <Button variant='ghost' onClick={() => navigate('/')}>
              Skip for now
            </Button>
            <Button onClick={onSubmit} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
