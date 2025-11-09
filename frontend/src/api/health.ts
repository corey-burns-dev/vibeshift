export async function fetchHealth() {
  const baseUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8080'
  const res = await fetch(`${baseUrl}/health`)
  if (!res.ok) throw new Error('Failed to fetch health status')
  return res.json()
}
