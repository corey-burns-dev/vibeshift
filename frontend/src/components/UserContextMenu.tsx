import type { User } from '@/api/types'
import {
  type ModerationActions,
  UserMenuItems,
} from '@/components/shared/UserMenuItems'
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
  moderationActions?: ModerationActions
}

export function UserContextMenu({
  user,
  children,
  moderationActions,
}: UserContextMenuProps) {
  const actions = useUserActions(user)

  if (actions.isSelf) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-56'>
        <UserMenuItems
          user={user}
          actions={actions}
          moderationActions={moderationActions}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
          Label={ContextMenuLabel}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}
