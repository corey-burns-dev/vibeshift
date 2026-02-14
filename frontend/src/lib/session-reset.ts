import { usePresenceStore } from '@/hooks/usePresence'
import { useNotificationStore } from '@/hooks/useRealtimeNotifications'
import { clearCachedUser, getCurrentUser } from '@/hooks/useUsers'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'
import { resetChatDockSession } from '@/stores/useChatDockStore'

interface ResetClientSessionOptions {
  previousUserID?: number | null
  nextUserID?: number | null
  clearAuth?: boolean
}

function normalizeUserID(userID: number | null | undefined): number | null {
  return typeof userID === 'number' && Number.isFinite(userID) ? userID : null
}

export function resetClientSessionState(
  options: ResetClientSessionOptions = {}
) {
  const previousUserID =
    normalizeUserID(options.previousUserID) ??
    normalizeUserID(getCurrentUser()?.id)
  const nextUserID = normalizeUserID(options.nextUserID)
  const clearAuth = options.clearAuth ?? false

  if (clearAuth) {
    useAuthSessionStore.getState().clear()
  }

  clearCachedUser()
  usePresenceStore.getState().reset()
  useNotificationStore.getState().clear()
  resetChatDockSession({
    previousUserID,
    nextUserID,
    clearPersisted: true,
  })

  if (previousUserID !== null) {
    localStorage.removeItem(`chat_open_tabs:${previousUserID}`)
    localStorage.removeItem(`joined_rooms:${previousUserID}`)
  }

  if (nextUserID === null) {
    localStorage.removeItem('user')
  }
}
