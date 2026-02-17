import countUnreadMessages from '@/lib/chat-unread'
import { describe, expect, it } from 'vitest'

describe('countUnreadMessages', () => {
  it('returns 0 for empty or undefined message lists', () => {
    expect(countUnreadMessages(undefined)).toBe(0)
    expect(countUnreadMessages([])).toBe(0)
  })

  it('counts all messages from others when no lastReadMessageId provided', () => {
    type Msg = { id?: number; sender_id: number; content?: string }
    const messages = [
      { id: 1, sender_id: 2, content: 'a' },
      { id: 2, sender_id: 3, content: 'b' },
      { id: 3, sender_id: 1, content: 'me' },
    ] as Msg[]

    expect(countUnreadMessages(messages, undefined, 1)).toBe(2)
  })

  it('only counts messages with id greater than lastReadMessageId', () => {
    type Msg = { id?: number; sender_id: number }
    const messages = [
      { id: 10, sender_id: 2 },
      { id: 11, sender_id: 3 },
      { id: 12, sender_id: 2 },
    ] as Msg[]

    expect(countUnreadMessages(messages, 11, 1)).toBe(1)
  })

  it('does not count messages sent by current user', () => {
    type Msg = { id?: number; sender_id: number }
    const messages = [
      { id: 5, sender_id: 1 },
      { id: 6, sender_id: 2 },
    ] as Msg[]

    expect(countUnreadMessages(messages, undefined, 1)).toBe(1)
  })
})
