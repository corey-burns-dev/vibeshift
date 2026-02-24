import { fireEvent, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/test/test-utils'
import { GameChat, type GameChatMessage } from './GameChat'

function renderGameChat(
  messages: GameChatMessage[] = [],
  overrides?: Partial<React.ComponentProps<typeof GameChat>>
) {
  const onChatInputChange = vi.fn()
  const onSend = vi.fn()
  const chatScrollRef = createRef<HTMLDivElement>()

  render(
    <GameChat
      messages={messages}
      currentUserId={1}
      chatInput=''
      onChatInputChange={onChatInputChange}
      onSend={onSend}
      chatScrollRef={chatScrollRef}
      {...overrides}
    />
  )

  return { onChatInputChange, onSend }
}

describe('GameChat', () => {
  it('shows empty state when there are no messages', () => {
    renderGameChat()

    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('renders messages and applies accent styling for own messages', () => {
    renderGameChat(
      [
        { user_id: 1, username: 'alice', text: 'my message' },
        { user_id: 2, username: 'bob', text: 'other message' },
      ],
      { accentColor: 'emerald' }
    )

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('my message')).toHaveClass('bg-emerald-600')
    expect(screen.getByText('other message')).toHaveClass('bg-muted')
  })

  it('calls handlers for typing, enter key, and send button', () => {
    const { onChatInputChange, onSend } = renderGameChat([], {
      placeholder: 'Say hi...',
      chatInput: 'hello',
    })

    const input = screen.getByPlaceholderText('Say hi...')
    fireEvent.change(input, { target: { value: 'hello world' } })
    expect(onChatInputChange).toHaveBeenCalledWith('hello world')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button'))
    expect(onSend).toHaveBeenCalledTimes(2)
  })
})
