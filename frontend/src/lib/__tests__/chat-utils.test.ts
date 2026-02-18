import { describe, expect, it } from 'vitest'
import {
  deduplicateDMConversations,
  getDirectMessageName,
} from '@/lib/chat-utils'

describe('chat-utils', () => {
  it('deduplicates DM conversations by other participant id', () => {
    const convs: any[] = [
      { id: 1, is_group: false, participants: [{ id: 1 }, { id: 2 }] },
      { id: 2, is_group: false, participants: [{ id: 1 }, { id: 2 }] },
      { id: 3, is_group: false, participants: [{ id: 1 }, { id: 3 }] },
    ]

    const deduped = deduplicateDMConversations(convs as any, 1)
    // Should keep first conversation for other user 2 and keep conversation for user 3
    expect(deduped.map(c => c.id)).toEqual([1, 3])
  })

  it('resolves a direct message name falling back to participant username', () => {
    const conv: any = {
      id: 5,
      participants: [{ id: 1 }, { id: 2, username: 'bob' }],
    }
    expect(getDirectMessageName(conv, 1)).toBe('bob')
  })
})
