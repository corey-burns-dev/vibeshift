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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useUserActions } from '@/hooks/useUserActions'

interface UserContextMenuProps {
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

export function UserContextMenu({
  user,
  children,
  moderationActions,
}: UserContextMenuProps) {
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

        {moderationActions?.canModerate && (
          <>
            <ContextMenuItem
              onClick={event => {
                event.stopPropagation()
                moderationActions.onKick?.()
              }}
            >
              <UserX className='mr-2 h-4 w-4' />
              <span>Kick from room</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={event => {
                event.stopPropagation()
                moderationActions.onTimeout?.()
              }}
            >
              <Timer className='mr-2 h-4 w-4' />
              <span>
                {moderationActions.isMuted ? 'Update Timeout' : 'Timeout User'}
              </span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={event => {
                event.stopPropagation()
                moderationActions.onToggleBan?.()
              }}
              className='text-destructive focus:text-destructive'
            >
              <Ban className='mr-2 h-4 w-4' />
              <span>
                {moderationActions.isBanned ? 'Unban from Room' : 'Ban from Room'}
              </span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {moderationActions?.canManageModerators && (
          <>
            <ContextMenuItem
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
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

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
          disabled={!targetOnline}
        >
          <Gamepad2 className='mr-2 h-4 w-4' />
          <span>{targetOnline ? 'Join Connect 4' : 'Connect 4 (Offline)'}</span>
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

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={event => {
            event.stopPropagation()
            toggleBlockUser()
          }}
          disabled={blockPending}
          className='text-destructive focus:text-destructive'
        >
          <Ban className='mr-2 h-4 w-4' />
          <span>{isBlocked ? 'Unblock User' : 'Block User'}</span>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={event => {
            event.stopPropagation()
            handleReportUser()
          }}
          className='text-destructive focus:text-destructive'
        >
          <Flag className='mr-2 h-4 w-4' />
          <span>Report User</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
