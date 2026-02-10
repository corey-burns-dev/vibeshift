import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateSanctumRequest } from '@/hooks/useSanctums'

export default function SanctumRequestForm() {
  const [requestedName, setRequestedName] = useState('')
  const [requestedSlug, setRequestedSlug] = useState('')
  const [reason, setReason] = useState('')
  const createRequest = useCreateSanctumRequest()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    createRequest.mutate({
      requested_name: requestedName,
      requested_slug: requestedSlug,
      reason,
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xl backdrop-blur-xl md:p-6">
        <h1 className="text-2xl font-bold">Request a Sanctum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a name, slug, and reason for review.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="requested-name">Requested Name</Label>
            <Input
              id="requested-name"
              value={requestedName}
              onChange={event => setRequestedName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="requested-slug">Requested Slug</Label>
            <Input
              id="requested-slug"
              value={requestedSlug}
              onChange={event => setRequestedSlug(event.target.value)}
              placeholder="lowercase-with-hyphens"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={4}
              required
            />
          </div>

          {createRequest.isError ? (
            <p className="text-sm text-destructive">
              Failed to submit request: {String(createRequest.error)}
            </p>
          ) : null}

          {createRequest.isSuccess ? (
            <p className="text-sm text-emerald-500">
              Request submitted. Track status in{' '}
              <Link className="underline" to="/sanctums/requests">
                My Requests
              </Link>
              .
            </p>
          ) : null}

          <Button type="submit" disabled={createRequest.isPending}>
            {createRequest.isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
        </form>
      </div>
    </div>
  )
}
