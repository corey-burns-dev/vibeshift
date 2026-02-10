import { Link } from 'react-router-dom'
import { SanctumNav } from '@/components/SanctumNav'
import { Button } from '@/components/ui/button'
import { useSanctums } from '@/hooks/useSanctums'
import { buildSanctumSections } from '@/lib/sanctums'

export default function Sanctums() {
  const { data = [], isLoading, isError, error, refetch } = useSanctums()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-muted-foreground">Loading sanctums...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-destructive">Failed to load sanctums.</p>
        <p className="mt-1 text-xs text-muted-foreground">{String(error)}</p>
        <Button className="mt-3" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const sections = buildSanctumSections(data)

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[18rem_1fr] lg:py-8">
      <SanctumNav {...sections} />

      <main className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl backdrop-blur-xl md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Sanctums</h1>
            <p className="text-sm text-muted-foreground">
              Discover and enter community spaces.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/sanctums/requests">My Requests</Link>
            </Button>
            <Button asChild>
              <Link to="/sanctums/request">Request a Sanctum</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {data.map(sanctum => (
            <Link
              key={sanctum.id}
              to={`/s/${sanctum.slug}`}
              className="rounded-xl border border-border/70 bg-background/60 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <h2 className="font-semibold">{sanctum.name}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {sanctum.description || 'No description yet.'}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                {sanctum.status}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
