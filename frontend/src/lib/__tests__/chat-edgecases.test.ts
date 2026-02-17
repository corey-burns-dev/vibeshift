import { describe, expect, it } from 'vitest'
import { countUnreadMessages } from '@/lib/chat-unread'
import {
  deduplicateDMConversations,
  getDirectMessageAvatar,
  getDirectMessageName,
} from '@/lib/chat-utils'

describe('chat utils edge cases', () => {
  it('deduplicates DM conversations keeping first occurrence', () => {
    type Participant = { id: number; username?: string; avatar?: string }
    type Conv = {
      id: number
      is_group?: boolean
      participants: Participant[]
      name?: string
    }

    const convs: Conv[] = [
      { id: 1, is_group: false, participants: [{ id: 10 }, { id: 2 }] },
      { id: 2, is_group: false, participants: [{ id: 10 }, { id: 2 }] },
      { id: 3, is_group: false, participants: [{ id: 10 }, { id: 3 }] },
    ]
    const deduped = deduplicateDMConversations(convs, 10)
    expect(deduped.map(c => c.id)).toEqual([1, 3])
  })

  it('resolves DM name and falls back when needed', () => {
    const convWithName: Conv = { id: 5, name: 'Team Up', participants: [] }
    expect(getDirectMessageName(convWithName, 1)).toBe('Team Up')

    const convUnnamed: Conv = {
      id: 6,
      participants: [
        { id: 1, username: 'me' },
        { id: 7, username: 'buddy' },
      ],
    }
    expect(getDirectMessageName(convUnnamed, 1)).toBe('buddy')
  })

  it('resolves DM avatar or falls back to pravatar url', () => {
    const convWithAvatar: Conv = {
      id: 11,
      participants: [{ id: 1 }, { id: 8, avatar: 'https://example.com/a.png' }],
    }
    expect(getDirectMessageAvatar(convWithAvatar, 1)).toBe(
      'https://example.com/a.png'
    )

    const convNoAvatar: Conv = {
      id: 12,
      participants: [{ id: 1 }, { id: 9, username: 'other' }],
    }
    const url = getDirectMessageAvatar(convNoAvatar, 1)
    expect(url).toContain('https://i.pravatar.cc')
  })

  it('counts unread messages with lastRead and current user filtering', () => {
    type Msg = { id?: number; sender_id: number }
    const messages: Msg[] = [
      { id: 1, sender_id: 2 }, // other, id 1
      { id: 2, sender_id: 1 }, // me, id 2
      { /* temp message without id */ sender_id: 2 },
    ]
    // Without lastRead: temp message counts as unread and other's message counts
    expect(countUnreadMessages(messages, undefined, 1)).toBe(2)

    // With lastRead=1: only messages with numeric id > 1 count; temp messages excluded
    expect(countUnreadMessages(messages, 1, 1)).toBe(0)
  })
})
