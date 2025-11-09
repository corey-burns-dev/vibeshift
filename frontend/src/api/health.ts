export async function fetchHealth() {
  const res = await fetch('/health')
  if (!res.ok) throw new Error('Network error')
  return res.json()
}
