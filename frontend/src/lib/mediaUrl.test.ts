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

  it('allows trusted external seed image hosts', () => {
    const picsum = 'https://picsum.photos/seed/abc/800/800'
    const youtubeThumb = 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    expect(normalizeImageURL(picsum)).toBe(picsum)
    expect(normalizeImageURL(youtubeThumb)).toBe(youtubeThumb)
  })

  it('accepts external image URLs for legacy post compatibility', () => {
    const external = 'https://cdn.example.com/photos/pic.png'
    expect(normalizeImageURL(external)).toBe(external)
  })

  it('keeps root-relative legacy image URLs', () => {
    expect(normalizeImageURL('/uploads/pic.jpg')).toBe('/uploads/pic.jpg')
  })

  it('rejects non-http schemes', () => {
    expect(normalizeImageURL('javascript:alert(1)')).toBeUndefined()
  })
})
