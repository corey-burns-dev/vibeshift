import { describe, expect, it } from 'vitest'
import type { Conversation } from '@/api/types'
import {
  deduplicateDMConversations,
  getDirectMessageName,
} from '@/lib/chat-utils'

describe('chat-utils', () => {
  it('deduplicates DM conversations by other participant id', () => {
    const convs: Conversation[] = [
      {
        id: 1,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 1 }, { id: 2 }] as Conversation['participants'],
      },
      {
        id: 2,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 1 }, { id: 2 }] as Conversation['participants'],
      },
      {
        id: 3,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 1 }, { id: 3 }] as Conversation['participants'],
      },
    ]

    const deduped = deduplicateDMConversations(convs, 1)
    // Should keep first conversation for other user 2 and keep conversation for user 3
    expect(deduped.map(c => c.id)).toEqual([1, 3])
  })

  it('resolves a direct message name falling back to participant username', () => {
    const conv: Conversation = {
      id: 5,
      is_group: false,
      created_by: 0,
      created_at: '',
      updated_at: '',
      participants: [
        { id: 1 },
        { id: 2, username: 'bob' },
      ] as Conversation['participants'],
    }
    expect(getDirectMessageName(conv, 1)).toBe('bob')
  })
})
