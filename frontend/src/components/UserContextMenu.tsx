import type { User } from '@/api/types'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useUserActions } from '@/hooks/useUserActions'
import {
    Gamepad2,
    MessageCircle,
    User as UserIcon,
    UserMinus,
    UserPlus,
} from 'lucide-react'

interface UserContextMenuProps {
  user: User
  children: React.ReactNode
}

export function UserContextMenu({ user, children }: UserContextMenuProps) {
  const {
    isSelf,
    handleViewProfile,
    handleMessage,
    handleJoinConnect4,
    handleAddFriend,
    handleRemoveFriend,
    canAddFriend,
    addFriendDisabled,
    addFriendLabel,
    isFriend,
    removeFriendPending,
  } = useUserActions(user)

  if (isSelf) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-56'>
        <ContextMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-1'>
            <p className='text-sm font-medium leading-none'>{user.username}</p>
            {user.bio && (
              <p className='text-xs text-muted-foreground truncate'>
                {user.bio}
              </p>
            )}
          </div>
        </ContextMenuLabel>
        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={event => {
            event.stopPropagation()
            handleViewProfile()
          }}
        >
          <UserIcon className='mr-2 h-4 w-4' />
          <span>View Profile</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={event => {
            event.stopPropagation()
            handleMessage()
          }}
        >
          <MessageCircle className='mr-2 h-4 w-4' />
          <span>Message</span>
        </ContextMenuItem>



        <ContextMenuItem
          onClick={event => {
            event.stopPropagation()
            void handleJoinConnect4()
          }}
        >
          <Gamepad2 className='mr-2 h-4 w-4' />
          <span>Join Connect 4</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {canAddFriend && (
          <ContextMenuItem
            onClick={event => {
              event.stopPropagation()
              handleAddFriend()
            }}
            disabled={addFriendDisabled}
          >
            <UserPlus className='mr-2 h-4 w-4' />
            <span>{addFriendLabel}</span>
          </ContextMenuItem>
        )}

        {isFriend && (
          <ContextMenuItem
            onClick={event => {
              event.stopPropagation()
              handleRemoveFriend()
            }}
            className='text-destructive focus:text-destructive'
            disabled={removeFriendPending}
          >
            <UserMinus className='mr-2 h-4 w-4' />
            <span>Remove Friend</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
