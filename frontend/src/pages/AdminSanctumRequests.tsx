import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { AdminSanctumRequestStatus } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCurrentUser } from '@/hooks'
import {
  useAdminSanctumRequests,
  useApproveSanctumRequest,
  useRejectSanctumRequest,
} from '@/hooks/useSanctums'

const filters: AdminSanctumRequestStatus[] = ['pending', 'approved', 'rejected']

export default function AdminSanctumRequests() {
  const currentUser = getCurrentUser()
  const [filter, setFilter] = useState<AdminSanctumRequestStatus>('pending')
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({})

  const {
    data = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminSanctumRequests(filter)
  const approveMutation = useApproveSanctumRequest()
  const rejectMutation = useRejectSanctumRequest()

  if (!currentUser?.is_admin) {
    return <Navigate to="/sanctums" replace />
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Admin Sanctum Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review and moderate queue.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {filters.map(status => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            onClick={() => setFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading queue...</p>
      ) : null}

      {isError ? (
        <div>
          <p className="text-destructive">Failed to load queue.</p>
          <p className="mt-1 text-xs text-muted-foreground">{String(error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError ? (
        <div className="space-y-3">
          {data.map(request => {
            const notes = reviewNotes[request.id] ?? ''

            return (
              <article
                key={request.id}
                className="rounded-xl border border-border/70 bg-card/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
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

                <Input
                  className="mt-3"
                  placeholder="Review notes (optional)"
                  value={notes}
                  onChange={event =>
                    setReviewNotes(prev => ({
                      ...prev,
                      [request.id]: event.target.value,
                    }))
                  }
                />

                {filter === 'pending' ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                      onClick={() =>
                        approveMutation.mutate({
                          id: request.id,
                          review_notes: notes,
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                      onClick={() =>
                        rejectMutation.mutate({
                          id: request.id,
                          review_notes: notes,
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </article>
            )
          })}

          {data.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
              No requests for this status.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
