import { describe, expect, it } from 'vitest'
import {
  shouldPlayFriendOnlineSound,
  shouldPlayNewMessageSoundForDM,
} from './chat-sounds'

describe('shouldPlayNewMessageSoundForDM', () => {
  it('returns true when DM and message is from another user', () => {
    expect(
      shouldPlayNewMessageSoundForDM(false, 2, 1)
    ).toBe(true)
  })

  it('returns false when current conversation is a group', () => {
    expect(
      shouldPlayNewMessageSoundForDM(true, 2, 1)
    ).toBe(false)
  })

  it('returns false when message is from self', () => {
    expect(
      shouldPlayNewMessageSoundForDM(false, 1, 1)
    ).toBe(false)
  })

  it('returns false when currentUserId is undefined', () => {
    expect(
      shouldPlayNewMessageSoundForDM(false, 2, undefined)
    ).toBe(false)
  })
})

describe('shouldPlayFriendOnlineSound', () => {
  it('returns true when friend comes online and not yet notified', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'online', 1, new Set(), [2, 3])
    ).toBe(true)
  })

  it('returns true for status "connected"', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'connected', 1, new Set(), [2])
    ).toBe(true)
  })

  it('returns false when user is not a friend', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'online', 1, new Set(), [3, 4])
    ).toBe(false)
  })

  it('returns false when user is self', () => {
    expect(
      shouldPlayFriendOnlineSound(1, 'online', 1, new Set(), [1, 2])
    ).toBe(false)
  })

  it('returns false when currentUserId is undefined', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'online', undefined, new Set(), [2])
    ).toBe(false)
  })

  it('returns false when user was already notified', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'online', 1, new Set([2]), [2])
    ).toBe(false)
  })

  it('returns false when status is not online/connected', () => {
    expect(
      shouldPlayFriendOnlineSound(2, 'offline', 1, new Set(), [2])
    ).toBe(false)
    expect(
      shouldPlayFriendOnlineSound(2, 'away', 1, new Set(), [2])
    ).toBe(false)
  })
})
