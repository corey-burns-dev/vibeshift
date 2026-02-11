import {
  Gamepad2,
  MessageCircle,
  User as UserIcon,
  UserMinus,
  UserPlus,
  Video,
} from 'lucide-react'
import type { User } from '@/api/types'
import { UserContextMenu } from '@/components/UserContextMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUserActions } from '@/hooks/useUserActions'

interface UserMenuProps {
  user: User
  children: React.ReactNode
}

export function UserMenu({ user, children }: UserMenuProps) {
  const {
    isSelf,
    handleViewProfile,
    handleMessage,
    handleVideoChat,
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
    <UserContextMenu user={user}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className='cursor-pointer'>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-56'>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col space-y-1'>
              <p className='text-sm font-medium leading-none'>
                {user.username}
              </p>
              {user.bio && (
                <p className='text-xs text-muted-foreground truncate'>
                  {user.bio}
                </p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              handleViewProfile()
            }}
          >
            <UserIcon className='mr-2 h-4 w-4' />
            <span>View Profile</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              handleMessage()
            }}
          >
            <MessageCircle className='mr-2 h-4 w-4' />
            <span>Message</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              handleVideoChat()
            }}
          >
            <Video className='mr-2 h-4 w-4' />
            <span>Video Chat</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              void handleJoinConnect4()
            }}
          >
            <Gamepad2 className='mr-2 h-4 w-4' />
            <span>Join Connect 4</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {canAddFriend && (
            <DropdownMenuItem
              onClick={event => {
                event.stopPropagation()
                handleAddFriend()
              }}
              disabled={addFriendDisabled}
            >
              <UserPlus className='mr-2 h-4 w-4' />
              <span>{addFriendLabel}</span>
            </DropdownMenuItem>
          )}

          {isFriend && (
            <DropdownMenuItem
              onClick={event => {
                event.stopPropagation()
                handleRemoveFriend()
              }}
              className='text-destructive focus:text-destructive'
              disabled={removeFriendPending}
            >
              <UserMinus className='mr-2 h-4 w-4' />
              <span>Remove Friend</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </UserContextMenu>
  )
}
