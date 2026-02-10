import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMySanctumRequests } from '@/hooks/useSanctums'

export default function MySanctumRequests() {
  const {
    data = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useMySanctumRequests()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-muted-foreground">Loading your requests...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-destructive">Failed to load your requests.</p>
        <p className="mt-1 text-xs text-muted-foreground">{String(error)}</p>
        <Button className="mt-3" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Sanctum Requests</h1>
          <p className="text-sm text-muted-foreground">
            Track approval status.
          </p>
        </div>
        <Button asChild>
          <Link to="/sanctums/request">New Request</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {data.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
            No requests yet.
          </div>
        ) : (
          data.map(request => (
            <article
              key={request.id}
              className="rounded-xl border border-border/70 bg-card/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{request.requested_name}</p>
                  <p className="text-xs text-muted-foreground">
                    /{request.requested_slug}
                  </p>
                </div>
                <Badge variant="outline" className="uppercase">
                  {request.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {request.reason}
              </p>
              {request.review_notes ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Review notes: {request.review_notes}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  )
}
