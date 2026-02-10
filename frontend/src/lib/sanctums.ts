import type { SanctumDTO } from '@/api/types'

const SYSTEM_SLUGS = ['atrium', 'herald', 'support'] as const
const FEATURED_SLUGS = ['development', 'gaming', 'anime', 'movies'] as const

function toSlugMap(sanctums: SanctumDTO[]) {
  return new Map(sanctums.map(s => [s.slug, s]))
}

export function buildSanctumSections(sanctums: SanctumDTO[]) {
  const bySlug = toSlugMap(sanctums)
  const used = new Set<string>()

  const system = SYSTEM_SLUGS.map(slug => bySlug.get(slug)).filter(
    (sanctum): sanctum is SanctumDTO => {
      if (!sanctum) return false
      used.add(sanctum.slug)
      return true
    }
  )

  const featured = FEATURED_SLUGS.map(slug => bySlug.get(slug)).filter(
    (sanctum): sanctum is SanctumDTO => {
      if (!sanctum) return false
      used.add(sanctum.slug)
      return true
    }
  )

  const explore = sanctums
    .filter(s => !used.has(s.slug))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return { system, featured, explore }
}
