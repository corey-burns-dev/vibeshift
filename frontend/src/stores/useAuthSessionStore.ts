import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthSessionState {
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  clear: () => void
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    set => ({
      accessToken: null,
      setAccessToken: (token: string | null) => set({ accessToken: token }),
      clear: () => set({ accessToken: null }),
    }),
    {
      name: 'auth-session-storage',
    }
  )
)
