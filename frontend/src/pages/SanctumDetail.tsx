import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { SanctumNav } from '@/components/SanctumNav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getCurrentUser } from '@/hooks'
import {
  useDemoteSanctumAdmin,
  useMySanctumMemberships,
  usePromoteSanctumAdmin,
  useSanctum,
  useSanctumAdmins,
  useSanctums,
} from '@/hooks/useSanctums'
import { buildSanctumSections } from '@/lib/sanctums'

export default function SanctumDetail() {
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()
  const [targetUserId, setTargetUserId] = useState('')
  const sanctumsQuery = useSanctums()
  const sanctumQuery = useSanctum(slug)
  const currentUser = getCurrentUser()
  const myMembershipsQuery = useMySanctumMemberships({
    enabled: Boolean(currentUser),
  })
  const isSanctumOwner = (myMembershipsQuery.data ?? []).some(
    membership =>
      membership.sanctum.slug === slug && membership.role === 'owner'
  )
  const canManageAdmins = Boolean(currentUser?.is_admin || isSanctumOwner)
  const sanctumAdminsQuery = useSanctumAdmins(slug, {
    enabled: canManageAdmins,
  })
  const [sanctumPosts, setSanctumPosts] = useState<
    Awaited<ReturnType<typeof apiClient.getPosts>>
  >([])
  const [sanctumPostsLoading, setSanctumPostsLoading] = useState(false)
  const [sanctumPostsError, setSanctumPostsError] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (!sanctumQuery.data?.id) return
    let cancelled = false
    setSanctumPostsLoading(true)
    setSanctumPostsError(null)
    apiClient
      .getPosts({
        sanctum_id: sanctumQuery.data.id,
        limit: 40,
        offset: 0,
      })
      .then(posts => {
        if (!cancelled) {
          setSanctumPosts(posts)
        }
      })
      .catch(error => {
        if (!cancelled) {
          setSanctumPostsError(
            error instanceof Error ? error.message : 'Failed to load posts'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSanctumPostsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [sanctumQuery.data?.id])
  const promoteSanctumAdmin = usePromoteSanctumAdmin(slug)
  const demoteSanctumAdmin = useDemoteSanctumAdmin(slug)

  const sections = buildSanctumSections(sanctumsQuery.data ?? [])
  const admins = sanctumAdminsQuery.data ?? []

  return (
    <div className='mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[18rem_1fr] lg:py-8'>
      <SanctumNav {...sections} />

      <main className='rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl backdrop-blur-xl md:p-6'>
        {sanctumQuery.isLoading ? (
          <p className='text-muted-foreground'>Loading sanctum...</p>
        ) : sanctumQuery.isError ? (
          <div>
            <p className='text-destructive'>Failed to load sanctum.</p>
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
        ) : !sanctumQuery.data ? (
          <p className='text-muted-foreground'>Sanctum not found.</p>
        ) : (
          <>
            <h1 className='text-3xl font-bold'>{sanctumQuery.data.name}</h1>
            <p className='mt-2 text-muted-foreground'>
              {sanctumQuery.data.description || 'No description yet.'}
            </p>

            <div className='mt-5 flex flex-wrap gap-2'>
              <Button
                onClick={() =>
                  navigate(`/chat/${sanctumQuery.data.default_chat_room_id}`)
                }
              >
                Open Chat
              </Button>
              <p className='self-center text-xs text-muted-foreground'>
                Room ID: {sanctumQuery.data.default_chat_room_id}
              </p>
            </div>

            <section className='mt-5 rounded-xl border border-border/60 bg-background/50 p-4'>
              <h2 className='font-semibold'>Posts in {sanctumQuery.data.name}</h2>
              {sanctumPostsLoading ? (
                <p className='mt-2 text-sm text-muted-foreground'>Loading posts...</p>
              ) : sanctumPostsError ? (
                <p className='mt-2 text-sm text-destructive'>
                  Failed to load posts for this sanctum.
                </p>
              ) : sanctumPosts.length === 0 ? (
                <p className='mt-2 text-sm text-muted-foreground'>
                  No posts in this sanctum yet.
                </p>
              ) : (
                <div className='mt-3 space-y-2'>
                  {sanctumPosts.map(post => (
                    <Card
                      key={post.id}
                      className='cursor-pointer rounded-xl border border-border/60 transition-colors hover:bg-muted/40'
                      onClick={() => navigate(`/posts/${post.id}`)}
                    >
                      <CardContent className='p-3'>
                        <p className='text-sm font-semibold'>
                          {post.title || 'Untitled Post'}
                        </p>
                        <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>
                          {post.content}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {canManageAdmins ? (
              <section className='mt-5 rounded-xl border border-border/60 bg-background/50 p-4'>
                <h2 className='font-semibold'>Sanctum Admins</h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Manage sanctum-level admins. Role label: "Sanctum Admin" maps
                  to backend role `mod`.
                </p>

                <div className='mt-3 flex gap-2'>
                  <Input
                    placeholder='User ID'
                    value={targetUserId}
                    onChange={e => setTargetUserId(e.target.value)}
                  />
                  <Button
                    disabled={promoteSanctumAdmin.isPending || !targetUserId}
                    onClick={() => {
                      const parsed = Number.parseInt(targetUserId, 10)
                      if (!Number.isFinite(parsed) || parsed <= 0) return
                      promoteSanctumAdmin.mutate(parsed)
                    }}
                  >
                    Promote to Sanctum Admin
                  </Button>
                </div>

                <div className='mt-4 space-y-2'>
                  {admins.map(admin => (
                    <div
                      key={admin.user_id}
                      className='flex items-center justify-between rounded-md border border-border/60 px-3 py-2'
                    >
                      <div>
                        <p className='text-sm font-medium'>
                          {admin.username} (#{admin.user_id})
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {admin.email} ·{' '}
                          {admin.role === 'mod' ? 'Sanctum Admin' : 'Owner'}
                        </p>
                      </div>
                      {admin.role === 'mod' ? (
                        <Button
                          variant='outline'
                          onClick={() =>
                            demoteSanctumAdmin.mutate(admin.user_id)
                          }
                        >
                          Demote
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {sanctumAdminsQuery.isError ? (
                    <p className='text-xs text-destructive'>
                      Failed to load sanctum admins:{' '}
                      {String(sanctumAdminsQuery.error)}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
