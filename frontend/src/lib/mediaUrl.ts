export function normalizeImageURL(url?: string): string | undefined {
  if (!url) return url

  const trimmed = url.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('/api/images/') || trimmed.startsWith('/media/i/')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (
      parsed.pathname.startsWith('/api/images/') ||
      parsed.pathname.startsWith('/media/i/')
    ) {
      return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    // Invalid URL — fall through to reject
  }

  return undefined
}
