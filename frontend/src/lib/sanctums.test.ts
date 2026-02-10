import { describe, expect, it } from 'vitest'
import type { SanctumDTO } from '@/api/types'
import { buildSanctumSections } from '@/lib/sanctums'

const makeSanctum = (
  id: number,
  name: string,
  slug: string
): SanctumDTO => ({
  id,
  name,
  slug,
  description: `${name} description`,
  status: 'active',
  default_chat_room_id: id * 100,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

describe('buildSanctumSections', () => {
  it('keeps fixed System and Featured order, while Explore is alphabetical and deduplicated', () => {
    const sanctums: SanctumDTO[] = [
      makeSanctum(1, 'The Herald', 'herald'),
      makeSanctum(2, 'The Forge', 'development'),
      makeSanctum(3, 'The Atrium', 'atrium'),
      makeSanctum(4, 'The Game Room', 'gaming'),
      makeSanctum(5, 'Sanctum Support', 'support'),
      makeSanctum(6, 'The Anime Hall', 'anime'),
      makeSanctum(7, 'The Silver Screen', 'movies'),
      makeSanctum(8, 'Zoo', 'zoo'),
      makeSanctum(9, 'Alpha', 'alpha'),
      makeSanctum(10, 'Beta', 'beta'),
    ]

    const sections = buildSanctumSections(sanctums)

    expect(sections.system.map(s => s.slug)).toEqual(['atrium', 'herald', 'support'])
    expect(sections.featured.map(s => s.slug)).toEqual([
      'development',
      'gaming',
      'anime',
      'movies',
    ])
    expect(sections.explore.map(s => s.name)).toEqual(['Alpha', 'Beta', 'Zoo'])

    const usedSlugs = new Set([
      ...sections.system.map(s => s.slug),
      ...sections.featured.map(s => s.slug),
    ])
    expect(sections.explore.every(s => !usedSlugs.has(s.slug))).toBe(true)
  })
})
