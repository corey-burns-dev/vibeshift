import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthSessionState {
  /** True once Zustand has rehydrated state from localStorage. */
  _hasHydrated: boolean
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  clear: () => void
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    set => ({
      _hasHydrated: false,
      accessToken: null,
      setAccessToken: (token: string | null) =>
        set({ accessToken: token, _hasHydrated: true }),
      clear: () => set({ accessToken: null, _hasHydrated: true }),
    }),
    {
      name: 'auth-session-storage',
      onRehydrateStorage: () => {
        return () => {
          useAuthSessionStore.setState({ _hasHydrated: true })
        }
      },
      partialize: state => ({
        accessToken: state.accessToken,
      }),
    }
  )
)
