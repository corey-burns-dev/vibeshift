import {
  Ban,
  Flag,
  Gamepad2,
  MessageCircle,
  Shield,
  Timer,
  User as UserIcon,
  UserMinus,
  UserPlus,
  UserX,
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
  moderationActions?: {
    canModerate: boolean
    canManageModerators: boolean
    isMuted?: boolean
    isBanned?: boolean
    isModerator?: boolean
    onKick?: () => void
    onTimeout?: () => void
    onToggleBan?: () => void
    onToggleModerator?: () => void
  }
}

export function UserMenu({ user, children, moderationActions }: UserMenuProps) {
  const {
    isSelf,
    handleViewProfile,
    handleMessage,
    handleJoinConnect4,
    targetOnline,
    handleAddFriend,
    handleRemoveFriend,
    canAddFriend,
    addFriendDisabled,
    addFriendLabel,
    isFriend,
    removeFriendPending,
    isBlocked,
    toggleBlockUser,
    handleReportUser,
    blockPending,
  } = useUserActions(user)

  if (isSelf) {
    return <>{children}</>
  }

  return (
    <UserContextMenu user={user} moderationActions={moderationActions}>
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

          {moderationActions?.canModerate && (
            <>
              <DropdownMenuItem
                onClick={event => {
                  event.stopPropagation()
                  moderationActions.onKick?.()
                }}
              >
                <UserX className='mr-2 h-4 w-4' />
                <span>Kick from room</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={event => {
                  event.stopPropagation()
                  moderationActions.onTimeout?.()
                }}
              >
                <Timer className='mr-2 h-4 w-4' />
                <span>
                  {moderationActions.isMuted ? 'Update Timeout' : 'Timeout User'}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={event => {
                  event.stopPropagation()
                  moderationActions.onToggleBan?.()
                }}
                className='text-destructive focus:text-destructive'
              >
                <Ban className='mr-2 h-4 w-4' />
                <span>
                  {moderationActions.isBanned
                    ? 'Unban from Room'
                    : 'Ban from Room'}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {moderationActions?.canManageModerators && (
            <>
              <DropdownMenuItem
                onClick={event => {
                  event.stopPropagation()
                  moderationActions.onToggleModerator?.()
                }}
              >
                <Shield className='mr-2 h-4 w-4' />
                <span>
                  {moderationActions.isModerator
                    ? 'Remove Room Moderator'
                    : 'Promote to Room Moderator'}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

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
              void handleJoinConnect4()
            }}
            disabled={!targetOnline}
          >
            <Gamepad2 className='mr-2 h-4 w-4' />
            <span>{targetOnline ? 'Join Connect 4' : 'Connect 4 (Offline)'}</span>
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

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              toggleBlockUser()
            }}
            disabled={blockPending}
            className='text-destructive focus:text-destructive'
          >
            <Ban className='mr-2 h-4 w-4' />
            <span>{isBlocked ? 'Unblock User' : 'Block User'}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={event => {
              event.stopPropagation()
              handleReportUser()
            }}
            className='text-destructive focus:text-destructive'
          >
            <Flag className='mr-2 h-4 w-4' />
            <span>Report User</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </UserContextMenu>
  )
}
