import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatDockConversationList } from '@/components/chat/ChatDockConversationList'
import { buildConversation, buildMessage, buildUser } from '@/test/test-utils'

vi.mock('@/hooks/usePresence', () => ({
  usePresenceStore: () => new Set<number>(),
}))

describe('ChatDockConversationList', () => {
  it('renders empty state when no conversations', () => {
    render(
      <ChatDockConversationList
        conversations={[]}
        currentUserId={1}
        unreadByConversation={{}}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No friend conversations yet')).toBeInTheDocument()
  })

  it('renders conversation list and calls onSelect when clicked', async () => {
    const onSelect = vi.fn()
    const conversations = [
      buildConversation({
        id: 1,
        is_group: false,
        participants: [buildUser({ id: 2, username: 'General' })],
        last_message: buildMessage({
          id: 1,
          conversation_id: 1,
          content: 'Hi',
        }),
      }),
    ]

    render(
      <ChatDockConversationList
        conversations={conversations}
        currentUserId={1}
        unreadByConversation={{}}
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('General')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText('General'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
