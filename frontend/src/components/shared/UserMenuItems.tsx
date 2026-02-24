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
import type { ComponentType, ReactNode } from 'react'
import type { User } from '@/api/types'
import type { useUserActions } from '@/hooks/useUserActions'

export interface ModerationActions {
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

interface MenuItemProps {
  onClick?: (e: React.MouseEvent) => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

interface UserMenuItemsProps {
  user: User
  actions: ReturnType<typeof useUserActions>
  moderationActions?: ModerationActions
  Item: ComponentType<MenuItemProps>
  Separator: ComponentType<{ className?: string }>
  Label: ComponentType<{ className?: string; children: ReactNode }>
}

/**
 * Shared menu items rendered inside both UserMenu (dropdown) and
 * UserContextMenu (context). Pass the appropriate primitives for each variant.
 */
export function UserMenuItems({
  user,
  actions,
  moderationActions,
  Item,
  Separator,
  Label,
}: UserMenuItemsProps) {
  const {
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
  } = actions

  return (
    <>
      <Label className='font-normal'>
        <div className='flex flex-col space-y-1'>
          <p className='text-sm font-medium leading-none'>{user.username}</p>
          {user.bio && (
            <p className='text-xs text-muted-foreground truncate'>{user.bio}</p>
          )}
        </div>
      </Label>
      <Separator />

      {moderationActions?.canModerate && (
        <>
          <Item
            onClick={e => {
              e.stopPropagation()
              moderationActions.onKick?.()
            }}
          >
            <UserX className='mr-2 h-4 w-4' />
            <span>Kick from room</span>
          </Item>
          <Item
            onClick={e => {
              e.stopPropagation()
              moderationActions.onTimeout?.()
            }}
          >
            <Timer className='mr-2 h-4 w-4' />
            <span>
              {moderationActions.isMuted ? 'Update Timeout' : 'Timeout User'}
            </span>
          </Item>
          <Item
            onClick={e => {
              e.stopPropagation()
              moderationActions.onToggleBan?.()
            }}
            className='text-destructive focus:text-destructive'
          >
            <Ban className='mr-2 h-4 w-4' />
            <span>
              {moderationActions.isBanned ? 'Unban from Room' : 'Ban from Room'}
            </span>
          </Item>
          <Separator />
        </>
      )}

      {moderationActions?.canManageModerators && (
        <>
          <Item
            onClick={e => {
              e.stopPropagation()
              moderationActions.onToggleModerator?.()
            }}
          >
            <Shield className='mr-2 h-4 w-4' />
            <span>
              {moderationActions.isModerator
                ? 'Remove Room Moderator'
                : 'Promote to Room Moderator'}
            </span>
          </Item>
          <Separator />
        </>
      )}

      <Item
        onClick={e => {
          e.stopPropagation()
          handleViewProfile()
        }}
      >
        <UserIcon className='mr-2 h-4 w-4' />
        <span>View Profile</span>
      </Item>

      <Item
        onClick={e => {
          e.stopPropagation()
          handleMessage()
        }}
      >
        <MessageCircle className='mr-2 h-4 w-4' />
        <span>Message</span>
      </Item>

      <Item
        onClick={e => {
          e.stopPropagation()
          void handleJoinConnect4()
        }}
        disabled={!targetOnline}
      >
        <Gamepad2 className='mr-2 h-4 w-4' />
        <span>{targetOnline ? 'Join Connect 4' : 'Connect 4 (Offline)'}</span>
      </Item>

      <Separator />

      {canAddFriend && (
        <Item
          onClick={e => {
            e.stopPropagation()
            handleAddFriend()
          }}
          disabled={addFriendDisabled}
        >
          <UserPlus className='mr-2 h-4 w-4' />
          <span>{addFriendLabel}</span>
        </Item>
      )}

      {isFriend && (
        <Item
          onClick={e => {
            e.stopPropagation()
            handleRemoveFriend()
          }}
          className='text-destructive focus:text-destructive'
          disabled={removeFriendPending}
        >
          <UserMinus className='mr-2 h-4 w-4' />
          <span>Remove Friend</span>
        </Item>
      )}

      <Separator />

      <Item
        onClick={e => {
          e.stopPropagation()
          toggleBlockUser()
        }}
        disabled={blockPending}
        className='text-destructive focus:text-destructive'
      >
        <Ban className='mr-2 h-4 w-4' />
        <span>{isBlocked ? 'Unblock User' : 'Block User'}</span>
      </Item>

      <Item
        onClick={e => {
          e.stopPropagation()
          handleReportUser()
        }}
        className='text-destructive focus:text-destructive'
      >
        <Flag className='mr-2 h-4 w-4' />
        <span>Report User</span>
      </Item>
    </>
  )
}
