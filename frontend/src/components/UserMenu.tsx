import type { User } from '@/api/types'
import {
  type ModerationActions,
  UserMenuItems,
} from '@/components/shared/UserMenuItems'
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
  moderationActions?: ModerationActions
}

export function UserMenu({ user, children, moderationActions }: UserMenuProps) {
  const actions = useUserActions(user)

  if (actions.isSelf) {
    return <>{children}</>
  }

  return (
    <UserContextMenu user={user} moderationActions={moderationActions}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className='cursor-pointer'>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-56'>
          <UserMenuItems
            user={user}
            actions={actions}
            moderationActions={moderationActions}
            Item={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
            Label={DropdownMenuLabel}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </UserContextMenu>
  )
}
