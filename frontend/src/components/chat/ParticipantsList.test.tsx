import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ParticipantsList } from '@/components/chat/ParticipantsList'

describe('ParticipantsList', () => {
  it('renders empty state when no participants', () => {
    render(<ParticipantsList participants={{}} onlineUserIds={new Set()} />)

    expect(screen.getByText('No one joined yet.')).toBeInTheDocument()
    expect(screen.getByText(/Online Members - 0/)).toBeInTheDocument()
  })

  it('renders online participants count and names', () => {
    const participants = {
      1: {
        id: 1,
        username: 'alice',
        online: true,
        typing: false,
      },
      2: {
        id: 2,
        username: 'bob',
        online: false,
        typing: false,
      },
    }

    render(
      <ParticipantsList
        participants={participants}
        onlineUserIds={new Set([2])}
      />
    )

    expect(screen.getByText(/Online Members - 2/)).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('shows User id when username is missing', () => {
    render(
      <ParticipantsList
        participants={{
          5: { id: 5, online: true, typing: false },
        }}
        onlineUserIds={new Set()}
      />
    )

    expect(screen.getByText('User 5')).toBeInTheDocument()
  })
})
