import { describe, expect, it } from 'vitest'
import { getYouTubeEmbedUrl } from '@/lib/youtube'

describe('getYouTubeEmbedUrl', () => {
  const videoID = 'dQw4w9WgXcQ'
  const embedURL = `https://www.youtube.com/embed/${videoID}`

  it('parses watch URLs', () => {
    expect(
      getYouTubeEmbedUrl(`https://www.youtube.com/watch?v=${videoID}`)
    ).toBe(embedURL)
  })

  it('parses youtu.be URLs with extra params', () => {
    expect(getYouTubeEmbedUrl(`https://youtu.be/${videoID}?si=abc&t=12`)).toBe(
      embedURL
    )
  })

  it('parses embed and shorts URLs', () => {
    expect(getYouTubeEmbedUrl(`https://www.youtube.com/embed/${videoID}`)).toBe(
      embedURL
    )
    expect(
      getYouTubeEmbedUrl(`https://www.youtube.com/shorts/${videoID}`)
    ).toBe(embedURL)
  })

  it('parses schemeless URLs and raw IDs', () => {
    expect(getYouTubeEmbedUrl(`youtube.com/watch?v=${videoID}`)).toBe(embedURL)
    expect(getYouTubeEmbedUrl(videoID)).toBe(embedURL)
  })

  it('returns null for invalid values', () => {
    expect(getYouTubeEmbedUrl('https://vimeo.com/123')).toBeNull()
    expect(getYouTubeEmbedUrl('')).toBeNull()
  })
})
