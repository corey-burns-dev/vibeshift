import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { User } from '@/api/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAvatarUrl, getInitials } from '@/lib/chat-utils'

export type FriendAction = 'add' | 'cancel' | 'accept' | 'reject' | 'remove'

interface FriendCardProps {
  user: User
  actionType: 'add' | 'cancel' | 'accept_reject' | 'remove'
  onAction: (action: FriendAction, user: User) => void
  isLoading?: boolean
}

export function FriendCard({
  user,
  actionType,
  onAction,
  isLoading = false,
}: FriendCardProps) {
  return (
    <Card className='overflow-hidden border border-border/40 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full group'>
      <Link to={`/users/${user.id}`} className='block relative'>
        <div className='aspect-square w-full bg-muted overflow-hidden'>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
            />
          ) : (
            <div className='w-full h-full flex items-center justify-center bg-muted/50'>
              <Avatar className='w-32 h-32 text-4xl'>
                <AvatarImage src={getAvatarUrl(user.username, 300)} />
                <AvatarFallback className='bg-primary/10 text-primary text-4xl font-bold'>
                  {getInitials(user.username)}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </Link>

      <div className='p-3 flex flex-col flex-1 gap-3'>
        <div className='flex-1 space-y-1'>
          <Link
            to={`/users/${user.id}`}
            className='hover:underline decoration-foreground/50'
          >
            <h3 className='font-semibold text-[17px] leading-tight text-foreground truncate'>
              {user.username}
            </h3>
          </Link>
          {/* Placeholder for mutual friends to match FB look */}
          <p className='text-[13px] text-muted-foreground truncate'>
            {user.bio || 'Suggested for you'}
          </p>
        </div>

        <div className='space-y-2 mt-auto'>
          {actionType === 'add' && (
            <Button
              className='w-full bg-[#E7F3FF] hover:bg-[#D9EAFE] text-[#1877F2] font-semibold h-9 shadow-none border-none'
              size='sm'
              disabled={isLoading}
              onClick={() => onAction('add', user)}
              type='button'
            >
              {isLoading ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Add Friend'
              )}
            </Button>
          )}

          {actionType === 'cancel' && (
            <Button
              variant='secondary'
              className='w-full bg-muted/80 hover:bg-muted text-foreground font-semibold h-9 shadow-none'
              size='sm'
              disabled={isLoading}
              onClick={() => onAction('cancel', user)}
              type='button'
            >
              {isLoading ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Cancel Request'
              )}
            </Button>
          )}

          {actionType === 'accept_reject' && (
            <div className='space-y-2'>
              <Button
                className='w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold h-9 shadow-none'
                size='sm'
                disabled={isLoading}
                onClick={() => onAction('accept', user)}
                type='button'
              >
                {isLoading ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  'Confirm'
                )}
              </Button>
              <Button
                variant='secondary'
                className='w-full bg-muted hover:bg-muted/80 text-foreground font-semibold h-9 shadow-none'
                size='sm'
                disabled={isLoading}
                onClick={() => onAction('reject', user)}
                type='button'
              >
                Delete
              </Button>
            </div>
          )}

          {actionType === 'remove' && (
            <Button
              variant='secondary'
              className='w-full bg-muted hover:bg-muted/80 text-foreground font-semibold h-9 shadow-none'
              size='sm'
              disabled={isLoading}
              onClick={() => onAction('remove', user)}
              type='button'
            >
              {isLoading ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Remove Friend'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
