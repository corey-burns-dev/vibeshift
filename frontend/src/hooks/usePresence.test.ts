import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePresenceStore } from '@/hooks/usePresence'

describe('usePresenceStore', () => {
  beforeEach(() => {
    usePresenceStore.setState({
      onlineUserIds: new Set(),
      notifiedUserIds: new Set(),
    })
  })

  it('starts with empty onlineUserIds', () => {
    const { result } = renderHook(() =>
      usePresenceStore(state => state.onlineUserIds)
    )
    expect(result.current).toEqual(new Set())
  })

  it('setOnline adds user id', () => {
    const { result } = renderHook(() => usePresenceStore(state => state))

    act(() => {
      result.current.setOnline(1)
    })

    expect(result.current.onlineUserIds).toEqual(new Set([1]))
  })

  it('setOffline removes user id', () => {
    const { result } = renderHook(() => usePresenceStore(state => state))

    act(() => {
      result.current.setInitialOnlineUsers([1, 2])
    })
    act(() => {
      result.current.setOffline(1)
    })

    expect(result.current.onlineUserIds).toEqual(new Set([2]))
  })

  it('setInitialOnlineUsers replaces with given ids', () => {
    const { result } = renderHook(() => usePresenceStore(state => state))

    act(() => {
      result.current.setOnline(1)
    })
    act(() => {
      result.current.setInitialOnlineUsers([3, 4, 5])
    })

    expect(result.current.onlineUserIds).toEqual(new Set([3, 4, 5]))
  })

  it('reset clears online and notified user ids', () => {
    const { result } = renderHook(() => usePresenceStore(state => state))

    act(() => {
      result.current.setInitialOnlineUsers([1, 2, 3])
      result.current.markNotified(4)
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.onlineUserIds).toEqual(new Set())
    expect(result.current.notifiedUserIds).toEqual(new Set())
  })
})
