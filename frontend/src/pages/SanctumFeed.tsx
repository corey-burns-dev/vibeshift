import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useIsAuthenticated } from '@/hooks'
import {
  useMySanctumMemberships,
  useSanctum,
  useUpsertMySanctumMemberships,
} from '@/hooks/useSanctums'
import Posts from '@/pages/Posts'

export default function SanctumFeed() {
  const { slug = '' } = useParams<{ slug: string }>()
  const isAuthenticated = useIsAuthenticated()
  const sanctumQuery = useSanctum(slug)
  const membershipsQuery = useMySanctumMemberships({
    enabled: isAuthenticated,
  })
  const upsertMemberships = useUpsertMySanctumMemberships()

  if (sanctumQuery.isLoading) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <p className='text-muted-foreground'>Loading sanctum...</p>
      </div>
    )
  }

  if (sanctumQuery.isError) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <p className='text-destructive'>Failed to load sanctum feed.</p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {String(sanctumQuery.error)}
        </p>
        <Button
          className='mt-3'
          variant='outline'
          onClick={() => sanctumQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (!sanctumQuery.data) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <p className='text-muted-foreground'>Sanctum not found.</p>
      </div>
    )
  }

  const currentMembership = (membershipsQuery.data ?? []).find(
    membership => membership.sanctum_id === sanctumQuery.data.id
  )
  const isOwner = currentMembership?.role === 'owner'
  const isJoined = Boolean(currentMembership)

  const handleJoin = () => {
    if (upsertMemberships.isPending) return
    const existingSlugs = (membershipsQuery.data ?? []).map(
      membership => membership.sanctum.slug
    )
    if (existingSlugs.includes(sanctumQuery.data.slug)) return

    upsertMemberships.mutate({
      sanctum_slugs: [...existingSlugs, sanctumQuery.data.slug],
    })
  }

  return (
    <div className='w-full'>
      <section className='mx-auto w-full max-w-480 px-3 pt-4 md:px-4 lg:px-5'>
        <div className='rounded-xl border border-border/70 bg-card px-4 py-3.5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h1 className='text-lg font-semibold'>
                {sanctumQuery.data.name}
              </h1>
              <p className='text-xs text-muted-foreground'>
                {sanctumQuery.data.description || 'Sanctum feed'}
              </p>
            </div>
            {isOwner ? (
              <Button asChild variant='outline' size='sm'>
                <Link to={`/sanctums/${sanctumQuery.data.slug}/manage`}>
                  Manage
                </Link>
              </Button>
            ) : isJoined ? (
              <Button variant='secondary' size='sm' disabled>
                Joined
              </Button>
            ) : isAuthenticated ? (
              <Button
                variant='outline'
                size='sm'
                onClick={handleJoin}
                disabled={upsertMemberships.isPending}
              >
                {upsertMemberships.isPending ? 'Joining...' : 'Join'}
              </Button>
            ) : (
              <Button asChild variant='outline' size='sm'>
                <Link to='/login'>Log in to Join</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
      <Posts sanctumId={sanctumQuery.data.id} />
    </div>
  )
}
