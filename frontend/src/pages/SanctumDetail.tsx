import { useNavigate, useParams } from 'react-router-dom'
import { SanctumNav } from '@/components/SanctumNav'
import { Button } from '@/components/ui/button'
import { useSanctum, useSanctums } from '@/hooks/useSanctums'
import { buildSanctumSections } from '@/lib/sanctums'

export default function SanctumDetail() {
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()
  const sanctumsQuery = useSanctums()
  const sanctumQuery = useSanctum(slug)

  const sections = buildSanctumSections(sanctumsQuery.data ?? [])

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[18rem_1fr] lg:py-8">
      <SanctumNav {...sections} />

      <main className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl backdrop-blur-xl md:p-6">
        {sanctumQuery.isLoading ? (
          <p className="text-muted-foreground">Loading sanctum...</p>
        ) : sanctumQuery.isError ? (
          <div>
            <p className="text-destructive">Failed to load sanctum.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {String(sanctumQuery.error)}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => sanctumQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !sanctumQuery.data ? (
          <p className="text-muted-foreground">Sanctum not found.</p>
        ) : (
          <>
            <h1 className="text-3xl font-bold">{sanctumQuery.data.name}</h1>
            <p className="mt-2 text-muted-foreground">
              {sanctumQuery.data.description || 'No description yet.'}
            </p>

            <div className="mt-5 rounded-xl border border-border/60 bg-background/50 p-4">
              <h2 className="font-semibold">Feed</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Feed placeholder for this sanctum.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  navigate(`/chat/${sanctumQuery.data.default_chat_room_id}`)
                }
              >
                Open Chat
              </Button>
              <p className="self-center text-xs text-muted-foreground">
                Room ID: {sanctumQuery.data.default_chat_room_id}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
