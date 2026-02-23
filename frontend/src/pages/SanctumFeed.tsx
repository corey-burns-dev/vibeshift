import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSanctum } from '@/hooks/useSanctums'
import Posts from '@/pages/Posts'

export default function SanctumFeed() {
  const { slug = '' } = useParams<{ slug: string }>()
  const sanctumQuery = useSanctum(slug)

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

  return (
    <div className='w-full'>
      <section className='mx-auto w-full max-w-480 px-3 pt-4 md:px-4 lg:px-5'>
        <div className='rounded-2xl border border-border/70 bg-card/70 px-4 py-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h1 className='text-lg font-semibold'>
                {sanctumQuery.data.name}
              </h1>
              <p className='text-xs text-muted-foreground'>
                {sanctumQuery.data.description || 'Sanctum feed'}
              </p>
            </div>
            <Button asChild variant='outline' size='sm'>
              <Link to={`/sanctums/${sanctumQuery.data.slug}/manage`}>
                Manage
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <Posts sanctumId={sanctumQuery.data.id} />
    </div>
  )
}
