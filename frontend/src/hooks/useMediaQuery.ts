import { useEffect, useState } from 'react'

/**
 * Returns true when the viewport matches the given media query.
 * Uses 768px (Tailwind `md`) as default to detect mobile.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const m = window.matchMedia(query)
    setMatches(m.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** True when viewport is below the md breakpoint (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
