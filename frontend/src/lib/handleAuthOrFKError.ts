// Shared handler for auth/foreign key errors in mutations
export function handleAuthOrFKError(error: unknown): boolean {
  let msg: string
  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    msg = (error as { message: string }).message
  } else {
    msg = String(error)
  }
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.toLowerCase().includes('unauthorized') ||
    msg.toLowerCase().includes('forbidden') ||
    msg.includes('foreign key constraint')
  ) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    alert('Your session is invalid or your user no longer exists. Please log in again.')
    window.location.href = '/login'
    return true
  }
  return false
}
