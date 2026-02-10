import type { LucideIcon } from 'lucide-react'
import { Compass, Sparkles, Star } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { SanctumDTO } from '@/api/types'
import { isRouteActive } from '@/components/navigation'
import { cn } from '@/lib/utils'

interface SanctumNavProps {
  system: SanctumDTO[]
  featured: SanctumDTO[]
  explore: SanctumDTO[]
}

function SanctumSection({
  title,
  icon: Icon,
  items,
}: {
  title: string
  icon: LucideIcon
  items: SanctumDTO[]
}) {
  const location = useLocation()

  return (
    <section className="space-y-1.5">
      <p className="flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>

      {items.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No sanctums yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            const path = `/s/${item.slug}`
            const active = isRouteActive(location.pathname, path)

            return (
              <Link
                key={item.id}
                to={path}
                className={cn(
                  'block rounded-lg px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
              >
                {item.name}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function SanctumNav({ system, featured, explore }: SanctumNavProps) {
  return (
    <aside className="w-full rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xl backdrop-blur-xl lg:sticky lg:top-20 lg:w-74 lg:self-start">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Sanctums</h2>
        <Link
          to="/sanctums"
          className="text-xs font-semibold text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="space-y-4">
        <SanctumSection title="System" icon={Sparkles} items={system} />
        <SanctumSection title="Featured" icon={Star} items={featured} />
        <SanctumSection title="Explore" icon={Compass} items={explore} />

        <section className="space-y-1.5">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Your Sanctums
          </p>
          <p className="px-2 text-xs text-muted-foreground">
            Follow/join support is coming soon.
          </p>
        </section>
      </div>
    </aside>
  )
}
