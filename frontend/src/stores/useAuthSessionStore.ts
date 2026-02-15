import { create } from 'zustand'

interface AuthSessionState {
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  clear: () => void
}

export const useAuthSessionStore = create<AuthSessionState>(set => ({
  accessToken: null,
  setAccessToken: (token: string | null) => set({ accessToken: token }),
  clear: () => set({ accessToken: null }),
}))

// Legacy migration: Move token from localStorage to in-memory store once on startup
if (typeof window !== 'undefined') {
  const legacyToken = localStorage.getItem('token')
  if (legacyToken) {
    useAuthSessionStore.getState().setAccessToken(legacyToken)
    // localStorage.removeItem('token')
    console.debug('[AuthSessionStore] Migrated legacy token to in-memory store')
  }
}
