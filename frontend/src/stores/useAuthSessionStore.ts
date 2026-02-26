import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthSessionState {
  /** True once Zustand has rehydrated state from localStorage. */
  _hasHydrated: boolean
  accessToken: string | null
  setHasHydrated: (value: boolean) => void
  setAccessToken: (token: string | null) => void
  clear: () => void
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    set => ({
      _hasHydrated: false,
      accessToken: null,
      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),
      setAccessToken: (token: string | null) =>
        set({ accessToken: token, _hasHydrated: true }),
      clear: () => set({ accessToken: null, _hasHydrated: true }),
    }),
    {
      name: 'auth-session-storage',
      onRehydrateStorage: () => {
        return (state, _error) => {
          if (state) {
            state.setHasHydrated(true)
            return
          }

          // If hydration fails before state is available, flip hydration on the
          // next microtask so ProtectedRoute cannot deadlock forever.
          queueMicrotask(() => {
            useAuthSessionStore.getState().setHasHydrated(true)
          })
        }
      },
      partialize: state => ({
        accessToken: state.accessToken,
      }),
    }
  )
)
