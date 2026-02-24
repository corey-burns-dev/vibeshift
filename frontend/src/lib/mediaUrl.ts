const TRUSTED_EXTERNAL_IMAGE_HOSTS = new Set([
  'picsum.photos',
  'img.youtube.com',
  'i.ytimg.com',
])

export function normalizeImageURL(url?: string): string | undefined {
  if (!url) return url

  const trimmed = url.trim()
  if (!trimmed) return undefined

  // Keep same-origin relative URLs intact.
  if (trimmed.startsWith('/')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }

    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      TRUSTED_EXTERNAL_IMAGE_HOSTS.has(parsed.hostname)
    ) {
      return parsed.toString()
    }

    if (
      parsed.pathname.startsWith('/api/images/') ||
      parsed.pathname.startsWith('/media/i/')
    ) {
      return `${parsed.pathname}${parsed.search}`
    }

    // Support legacy and external image URLs.
    return parsed.toString()
  } catch {
    // Invalid URL — fall through to reject
  }

  return undefined
}
