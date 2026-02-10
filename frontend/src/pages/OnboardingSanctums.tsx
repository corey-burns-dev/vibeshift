import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useSanctums, useUpsertMySanctumMemberships } from '@/hooks/useSanctums'

const REQUIRED_SLUG = 'atrium'
const DEFAULT_SLUGS = new Set(['atrium', 'development', 'gaming'])

export default function OnboardingSanctums() {
  const navigate = useNavigate()
  const { data: sanctums = [], isLoading, isError } = useSanctums()
  const upsert = useUpsertMySanctumMemberships()
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_SLUGS))

  const sortedSanctums = useMemo(
    () => [...sanctums].sort((a, b) => a.name.localeCompare(b.name)),
    [sanctums]
  )

  const selectedCount = selected.size
  const canSubmit = selectedCount >= 3 && selected.has(REQUIRED_SLUG)

  const toggle = (slug: string) => {
    if (slug === REQUIRED_SLUG) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      next.add(REQUIRED_SLUG)
      return next
    })
  }

  const onSubmit = async () => {
    if (!canSubmit) {
      toast.error('Pick at least 3 sanctums. Atrium is required.')
      return
    }

    const chosen = sortedSanctums
      .map(s => s.slug)
      .filter(slug => selected.has(slug))

    try {
      await upsert.mutateAsync({ sanctum_slugs: chosen })
      toast.success('Your sanctums are ready.')
      navigate('/posts')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save sanctum choices'
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Loading sanctums...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">
          Failed to load sanctums. Refresh and try again.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose your Sanctums
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick at least 3 to personalize your feed. Atrium is required.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sortedSanctums.map(sanctum => {
          const checked = selected.has(sanctum.slug)
          const isRequired = sanctum.slug === REQUIRED_SLUG
          return (
            <Card key={sanctum.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{sanctum.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {sanctum.description || 'No description'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="h-4 w-4 rounded border-input"
                    type="checkbox"
                    id={`sanctum-${sanctum.slug}`}
                    checked={checked}
                    disabled={isRequired}
                    onChange={() => toggle(sanctum.slug)}
                  />
                  <Label htmlFor={`sanctum-${sanctum.slug}`}>
                    {isRequired ? 'Joined (required)' : 'Join sanctum'}
                  </Label>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-sm text-muted-foreground">
          Selected: {selectedCount} / 3 minimum
        </p>
        <Button onClick={onSubmit} disabled={!canSubmit || upsert.isPending}>
          {upsert.isPending ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
