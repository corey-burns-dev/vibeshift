import { describe, expect, it } from 'vitest'
import { normalizeImageURL } from '@/lib/mediaUrl'

describe('normalizeImageURL', () => {
  it('keeps relative api image URLs unchanged', () => {
    expect(normalizeImageURL('/api/images/hash123')).toBe('/api/images/hash123')
    expect(normalizeImageURL('/api/images/hash123?size=thumbnail')).toBe(
      '/api/images/hash123?size=thumbnail'
    )
  })

  it('converts absolute api image URLs to relative', () => {
    expect(normalizeImageURL('http://localhost:8375/api/images/hash123')).toBe(
      '/api/images/hash123'
    )
    expect(
      normalizeImageURL('https://example.com/api/images/hash123?size=medium')
    ).toBe('/api/images/hash123?size=medium')
  })

  it('rejects non-api image URLs', () => {
    const external = 'https://cdn.example.com/photos/pic.png'
    expect(normalizeImageURL(external)).toBeUndefined()
  })
})
