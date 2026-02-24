/**
 * Extract YouTube video ID from watch or embed URL and return embed URL.
 */
export function getYouTubeEmbedUrl(url: string): string | null {
  const extractVideoID = (candidate: string): string | null => {
    const id = candidate.trim()
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
  }

  const toEmbed = (videoID: string): string =>
    `https://www.youtube.com/embed/${videoID}`

  try {
    const raw = url.trim()
    if (!raw) return null

    // Support raw IDs.
    const rawID = extractVideoID(raw)
    if (rawID) {
      return toEmbed(rawID)
    }

    const parsedInput =
      /^https?:\/\//i.test(raw) || raw.startsWith('//') ? raw : `https://${raw}`

    const u = new URL(parsedInput)
    const host = u.hostname.toLowerCase()

    let videoID: string | null = extractVideoID(u.searchParams.get('v') ?? '')

    if (!videoID && host.includes('youtu.be')) {
      videoID = extractVideoID(u.pathname.split('/').filter(Boolean)[0] ?? '')
    }

    if (
      !videoID &&
      (host.includes('youtube.com') || host.includes('youtube-nocookie.com'))
    ) {
      const [first, second] = u.pathname.split('/').filter(Boolean)
      if (first === 'embed' || first === 'shorts' || first === 'live') {
        videoID = extractVideoID(second ?? '')
      }
    }

    if (videoID) {
      return toEmbed(videoID)
    }
  } catch {
    // ignore
  }
  return null
}
