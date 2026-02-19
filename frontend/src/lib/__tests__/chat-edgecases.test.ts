import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '@/api/types'
import { countUnreadMessages } from '@/lib/chat-unread'
import {
  deduplicateDMConversations,
  getDirectMessageAvatar,
  getDirectMessageName,
} from '@/lib/chat-utils'

describe('chat utils edge cases', () => {
  it('deduplicates DM conversations keeping first occurrence', () => {
    const convs: Conversation[] = [
      {
        id: 1,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 10 }, { id: 2 }] as Conversation['participants'],
      },
      {
        id: 2,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 10 }, { id: 2 }] as Conversation['participants'],
      },
      {
        id: 3,
        is_group: false,
        created_by: 0,
        created_at: '',
        updated_at: '',
        participants: [{ id: 10 }, { id: 3 }] as Conversation['participants'],
      },
    ]
    const deduped = deduplicateDMConversations(convs, 10)
    expect(deduped.map(c => c.id)).toEqual([1, 3])
  })

  it('resolves DM name and falls back when needed', () => {
    const convWithName: Conversation = {
      id: 5,
      name: 'Team Up',
      is_group: false,
      created_by: 0,
      created_at: '',
      updated_at: '',
      participants: [],
    }
    expect(getDirectMessageName(convWithName, 1)).toBe('Team Up')

    const convUnnamed: Conversation = {
      id: 6,
      is_group: false,
      created_by: 0,
      created_at: '',
      updated_at: '',
      participants: [
        { id: 1, username: 'me' },
        { id: 7, username: 'buddy' },
      ] as Conversation['participants'],
    }
    expect(getDirectMessageName(convUnnamed, 1)).toBe('buddy')
  })

  it('resolves DM avatar or falls back to pravatar url', () => {
    const convWithAvatar: Conversation = {
      id: 11,
      is_group: false,
      created_by: 0,
      created_at: '',
      updated_at: '',
      participants: [
        { id: 1 },
        { id: 8, avatar: 'https://example.com/a.png' },
      ] as Conversation['participants'],
    }
    expect(getDirectMessageAvatar(convWithAvatar, 1)).toBe(
      'https://example.com/a.png'
    )

    const convNoAvatar: Conversation = {
      id: 12,
      is_group: false,
      created_by: 0,
      created_at: '',
      updated_at: '',
      participants: [
        { id: 1 },
        { id: 9, username: 'other' },
      ] as Conversation['participants'],
    }
    const url = getDirectMessageAvatar(convNoAvatar, 1)
    expect(url).toContain('https://i.pravatar.cc')
  })

  it('counts unread messages with lastRead and current user filtering', () => {
    type MessageLike = Pick<Message, 'sender_id'> & { id?: number }
    const messages: MessageLike[] = [
      { id: 1, sender_id: 2 }, // other, id 1
      { id: 2, sender_id: 1 }, // me, id 2
      { /* temp message without id */ sender_id: 2 },
    ]
    // Without lastRead: temp message counts as unread and other's message counts
    expect(countUnreadMessages(messages as Message[], undefined, 1)).toBe(2)

    // With lastRead=1: only messages with numeric id > 1 count; temp messages excluded
    expect(countUnreadMessages(messages as Message[], 1, 1)).toBe(0)
  })
})
