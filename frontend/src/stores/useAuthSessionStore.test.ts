import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'auth-session-storage'

async function loadStore() {
  vi.resetModules()
  const mod = await import('./useAuthSessionStore')
  const store = mod.useAuthSessionStore
  await Promise.resolve(store.persist.rehydrate())
  await Promise.resolve()
  return store
}

async function waitForHydration(store: {
  getState: () => { _hasHydrated: boolean }
}) {
  for (let i = 0; i < 20; i += 1) {
    if (store.getState()._hasHydrated) {
      return
    }
    await Promise.resolve()
  }

  throw new Error('Store did not finish hydrating in time')
}

describe('useAuthSessionStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sets _hasHydrated to true after valid persisted rehydration', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { accessToken: 'token-123' },
        version: 0,
      })
    )

    const store = await loadStore()
    await waitForHydration(store)

    expect(store.getState()._hasHydrated).toBe(true)
    expect(store.getState().accessToken).toBe('token-123')
  })

  it('sets _hasHydrated to true even when persisted payload is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')

    const store = await loadStore()
    await waitForHydration(store)

    expect(store.getState()._hasHydrated).toBe(true)
    expect(store.getState().accessToken).toBeNull()
  })

  it('keeps _hasHydrated true when setAccessToken and clear are called', async () => {
    const store = await loadStore()

    store.setState({ _hasHydrated: false, accessToken: null })
    store.getState().setAccessToken('token-456')

    expect(store.getState()._hasHydrated).toBe(true)
    expect(store.getState().accessToken).toBe('token-456')

    store.getState().clear()

    expect(store.getState()._hasHydrated).toBe(true)
    expect(store.getState().accessToken).toBeNull()
  })
})
