import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../api/health'

export function useHealth() {
  return useQuery(['health'], fetchHealth, { refetchOnWindowFocus: false })
}
