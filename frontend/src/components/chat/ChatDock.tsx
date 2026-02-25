import { GripHorizontal, MessageCircle, Minus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import type { Conversation, Message, User } from '@/api/types'
import { ChatDockConversationList } from '@/components/chat/ChatDockConversationList'
import { ChatDockConversationView } from '@/components/chat/ChatDockConversationView'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAudio } from '@/hooks/useAudio'
import {
  useConversation,
  useConversations,
  useCreateConversation,
} from '@/hooks/useChat'
import { useFriends } from '@/hooks/useFriends'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { usePresenceStore } from '@/hooks/usePresence'
import { getCurrentUser } from '@/hooks/useUsers'
import {
  shouldPlayFriendDMInMessagesView,
  shouldPlayFriendOnlineSound,
} from '@/lib/chat-sounds'
import { getDirectMessageAvatar, getDirectMessageName } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/providers/ChatProvider'
import { useChatDockStore } from '@/stores/useChatDockStore'

function showUserToast({
  avatar,
  initials,
  title,
  subtitle,
  onClick,
  duration,
}: {
  avatar?: string
  initials: string
  title: string
  subtitle: string
  onClick: () => void
  duration?: number
}) {
  toast(
    <button
      type='button'
      className='flex w-full items-center gap-3 cursor-pointer border-none bg-transparent p-0 text-left'
      onClick={onClick}
    >
      <Avatar className='h-9 w-9 border-2 border-primary/20'>
        <AvatarImage src={avatar} />
        <AvatarFallback className='bg-primary/10 text-[10px] font-bold text-primary'>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className='flex flex-col min-w-0'>
        <span className='truncate text-[13px] font-bold text-foreground'>
          {title}
        </span>
        <span className='line-clamp-1 text-[11px] text-muted-foreground'>
          {subtitle}
        </span>
      </div>
    </button>,
    {
      duration,
      className: 'border-border/50 bg-background/95 backdrop-blur-md shadow-xl',
    }
  )
}

interface ChatDockPanelContentProps {
  view: 'list' | 'conversation'
  conversationName: string
  conversations: Conversation[]
  activeConversationId: number | null
  openConversationIds: number[]
  activeConversation: Conversation | undefined
  currentUserId: number | undefined
  typingUsers: string[]
  onMinimize: () => void
  onClose: () => void
  onSelectConversation: (id: number | null) => void
  onRemoveConversation: (id: number) => void
  onClearAll: () => void
  sendTyping: (isTyping: boolean) => void
  unreadByConversation: Record<string, number>
  isDraggable?: boolean
}

function ChatDockPanelContent({
  view,
  conversationName,
  conversations,
  activeConversationId,
  openConversationIds,
  activeConversation,
  currentUserId,
  typingUsers,
  onMinimize,
  onClose,
  onSelectConversation,
  onRemoveConversation,
  onClearAll,
  sendTyping,
  unreadByConversation,
  isDraggable,
}: ChatDockPanelContentProps) {
  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div
        className={cn(
          'flex items-center justify-between border-b border-border/50 px-4 py-2.5',
          isDraggable && 'cursor-move'
        )}
      >
        <div className='flex min-w-0 items-center gap-2'>
          {isDraggable && (
            <GripHorizontal className='h-3.5 w-3.5 shrink-0 text-muted-foreground/50' />
          )}
          <h2 className='truncate text-sm font-semibold'>
            {view === 'conversation' ? conversationName : 'Friends'}
          </h2>
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={onMinimize}
          >
            <Minus className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      {openConversationIds.length > 0 && (
        <div className='flex items-center border-b border-border/50 bg-muted/30'>
          <div className='flex flex-1 items-center gap-1 overflow-x-auto p-1.5 no-scrollbar'>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size='sm'
              className={cn(
                'h-7 shrink-0 px-2.5 text-[11px] font-medium',
                view === 'list' && 'bg-background shadow-sm'
              )}
              onClick={() => onSelectConversation(null)}
            >
              All
            </Button>
            {openConversationIds.map(id => {
              const conv = conversations.find(c => c.id === id)
              if (!conv) return null
              const name = getDirectMessageName(conv, currentUserId)
              const isActive =
                view === 'conversation' && activeConversationId === id
              const unread = unreadByConversation[String(id)] || 0

              return (
                <div
                  key={id}
                  className={cn(
                    'group relative flex shrink-0 items-center rounded-md transition-colors',
                    isActive ? 'bg-background shadow-sm' : 'hover:bg-accent/50',
                    unread > 0 && !isActive && 'animate-pulse'
                  )}
                >
                  <Button
                    variant='ghost'
                    size='sm'
                    className={cn(
                      'h-7 px-2.5 text-[11px] font-medium transition-none',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                      unread > 0 && !isActive && 'text-primary'
                    )}
                    onClick={() => onSelectConversation(id)}
                  >
                    {name}
                    {unread > 0 && (
                      <span className='ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.6)]' />
                    )}
                  </Button>
                  <button
                    type='button'
                    onClick={e => {
                      e.stopPropagation()
                      onRemoveConversation(id)
                    }}
                    className='flex h-7 w-6 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              )
            })}
          </div>
          {openConversationIds.length > 2 && (
            <Button
              variant='ghost'
              size='sm'
              className='h-7 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive'
              onClick={onClearAll}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {view === 'list' ? (
        <ChatDockConversationList
          conversations={conversations}
          currentUserId={currentUserId}
          unreadByConversation={unreadByConversation}
          onSelect={onSelectConversation}
        />
      ) : activeConversationId ? (
        <ChatDockConversationView
          conversationId={activeConversationId}
          conversation={activeConversation}
          currentUserId={currentUserId}
          sendTyping={sendTyping}
          typingUsers={typingUsers}
        />
      ) : null}
    </div>
  )
}

export function ChatDock() {
  const currentUser = getCurrentUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const [typingState, setTypingState] = useState<
    Record<number, Record<number, { username: string; expires: number }>>
  >({})
  const { playNewMessageSound } = useAudio()

  const {
    isOpen,
    minimized,
    view,
    activeConversationId,
    openConversationIds,
    toggle,
    open,
    minimize,
    close,
    setActiveConversation,
    removeOpenConversation,
    clearOpenConversations,
    dockPos,
    setDockPos,
  } = useChatDockStore()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('left')
  // Set to true when a drag gesture (with movement > threshold) actually occurred.
  // Allows the button's onClick to distinguish click vs drag-release.
  const didDragRef = useRef(false)

  const updatePanelSide = useCallback(() => {
    if (isMobile) return

    const wrapper = wrapperRef.current
    const panel = panelRef.current
    if (!wrapper || !panel) return

    const wrapperRect = wrapper.getBoundingClientRect()
    const viewportPadding = 16
    const panelWidth = panel.offsetWidth || 380
    const viewportWidth = window.innerWidth

    const canOpenRight =
      wrapperRect.left + panelWidth <= viewportWidth - viewportPadding
    const canOpenLeft = wrapperRect.right - panelWidth >= viewportPadding

    let nextSide: 'left' | 'right' = 'left'
    if (!canOpenRight && canOpenLeft) {
      nextSide = 'right'
    } else if (canOpenRight && canOpenLeft) {
      const anchorCenter = wrapperRect.left + wrapperRect.width / 2
      nextSide = anchorCenter <= viewportWidth / 2 ? 'left' : 'right'
    } else if (!canOpenRight && !canOpenLeft) {
      const rightSpace = viewportWidth - wrapperRect.left - viewportPadding
      const leftSpace = wrapperRect.right - viewportPadding
      nextSide = leftSpace > rightSpace ? 'right' : 'left'
    }

    setPanelSide(prev => (prev === nextSide ? prev : nextSide))
  }, [isMobile])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return

      const wrapper = wrapperRef.current
      if (!wrapper) return

      // Don't start drag on interactive controls inside the panel (inputs, etc.)
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const rect = wrapper.getBoundingClientRect()
      const startX = e.clientX
      const startY = e.clientY
      dragOffsetRef.current = { x: startX - rect.left, y: startY - rect.top }

      let hasMoved = false

      const handleMouseMove = (ev: MouseEvent) => {
        if (!hasMoved) {
          const dx = ev.clientX - startX
          const dy = ev.clientY - startY
          if (Math.sqrt(dx * dx + dy * dy) < 5) return
          hasMoved = true
        }
        const w = wrapperRef.current
        if (!w) return
        const newX = Math.max(
          0,
          Math.min(
            ev.clientX - dragOffsetRef.current.x,
            window.innerWidth - w.offsetWidth
          )
        )
        const newY = Math.max(
          0,
          Math.min(
            ev.clientY - dragOffsetRef.current.y,
            window.innerHeight - w.offsetHeight
          )
        )
        w.style.left = `${newX}px`
        w.style.top = `${newY}px`
        w.style.bottom = 'auto'
        w.style.right = 'auto'
        if (isOpen && !minimized) {
          updatePanelSide()
        }
      }

      const handleMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)

        if (!hasMoved) return

        didDragRef.current = true
        const w = wrapperRef.current
        if (!w) return
        const newX = Math.max(
          0,
          Math.min(
            ev.clientX - dragOffsetRef.current.x,
            window.innerWidth - w.offsetWidth
          )
        )
        const newY = Math.max(
          0,
          Math.min(
            ev.clientY - dragOffsetRef.current.y,
            window.innerHeight - w.offsetHeight
          )
        )
        setDockPos({ x: newX, y: newY })
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [isMobile, isOpen, minimized, setDockPos, updatePanelSide]
  )

  // onClick for the floating button: ignore if drag just finished
  const handleButtonClick = useCallback(() => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    toggle()
  }, [toggle])

  const handleDragReset = useCallback(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.left = ''
      wrapperRef.current.style.top = ''
      wrapperRef.current.style.bottom = ''
      wrapperRef.current.style.right = ''
    }
    setDockPos(null)
  }, [setDockPos])

  // Stable ref always pointing to the latest handleSelectConversation.
  // Used in toast onClick closures to avoid stale captures of the virtual-DM path.
  const handleSelectConversationRef = useRef<(id: number | null) => void>(
    () => {}
  )

  const { data: conversations = [] } = useConversations()
  const { data: friends = [], isSuccess: friendsLoaded } = useFriends()
  const { mutate: createConversation } = useCreateConversation()
  const { data: activeConversation } = useConversation(
    activeConversationId || 0,
    { enabled: activeConversationId !== null && activeConversationId > 0 }
  )
  const isMessagesRoute =
    location.pathname.includes('/messages') ||
    location.pathname === '/chat' ||
    location.pathname.startsWith('/chat/')

  const friendUserIds = useMemo(
    () => new Set(friends.map((f: { id: number }) => f.id)),
    [friends]
  )

  const friendDMConversations = useMemo(() => {
    const existingDMs = conversations.filter(c => {
      if (c.is_group) return false
      const other = c.participants?.find(p => p.id !== currentUser?.id)
      return other ? friendUserIds.has(other.id) : false
    })

    const usersWithDM = new Set(
      existingDMs.flatMap(c =>
        c.participants?.filter(p => p.id !== currentUser?.id).map(p => p.id)
      )
    )

    const virtualDMs: Conversation[] = friends
      .filter(f => !usersWithDM.has(f.id))
      .map(f => ({
        id: -f.id, // Use negative ID to distinguish virtual DMs
        is_group: false,
        created_by: currentUser?.id || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        participants: [f, currentUser].filter((p): p is User => !!p),
      }))

    return [...existingDMs, ...virtualDMs]
  }, [conversations, currentUser, friendUserIds, friends])

  const friendDMConversationIds = useMemo(
    () => new Set(friendDMConversations.map(c => c.id)),
    [friendDMConversations]
  )

  const {
    joinRoom,
    leaveRoom,
    sendTyping: ctxSendTyping,
    unreadByConversation,
    incrementUnread,
    clearUnread,
    seedUnread,
    subscribeOnMessage,
    subscribeOnTyping,
    subscribeOnPresence,
  } = useChatContext()

  // Restore persisted unread counts into the context state on first mount so the
  // floating-button badge is correct immediately after a page reload.
  useEffect(() => {
    const { unreadCounts } = useChatDockStore.getState()
    const stringKeyed: Record<string, number> = {}
    for (const [id, count] of Object.entries(unreadCounts)) {
      if (count > 0) stringKeyed[String(id)] = count
    }
    if (Object.keys(stringKeyed).length > 0) {
      seedUnread(stringKeyed)
    }
  }, [seedUnread]) // seedUnread is stable (useCallback with empty deps)

  const notifiedUserIds = usePresenceStore(state => state.notifiedUserIds)
  const markNotified = usePresenceStore(state => state.markNotified)
  const { playFriendOnlineSound } = useAudio()

  // Friend Online Toasts
  useEffect(() => {
    const unsub = subscribeOnPresence((userId, username, status) => {
      if (
        shouldPlayFriendOnlineSound(
          userId,
          status,
          currentUser?.id,
          notifiedUserIds,
          friends.map(f => f.id)
        )
      ) {
        markNotified(userId)
        playFriendOnlineSound()

        const friend = friends.find(f => f.id === userId)

        showUserToast({
          avatar: friend?.avatar,
          initials: username.slice(0, 2).toUpperCase(),
          title: `${username} is online!`,
          subtitle: 'Jump in and say hi',
          onClick: () => {
            handleSelectConversationRef.current(-userId)
            open()
          },
          duration: 4000,
        })
      }
    })
    return () => unsub()
  }, [
    currentUser?.id,
    friends,
    notifiedUserIds,
    markNotified,
    playFriendOnlineSound,
    subscribeOnPresence,
    open,
  ])

  // New Friend Online Check: if we just became friends and they are already online, notify.
  // We use a ref to track which friend IDs we've already "checked" during this session
  // to avoid re-notifying on every friends list refresh.
  const checkedFriendIdsRef = useRef<Set<number>>(new Set())
  const { isUserOnline } = useChatContext()

  useEffect(() => {
    if (!friendsLoaded || friends.length === 0) return

    for (const friend of friends) {
      if (checkedFriendIdsRef.current.has(friend.id)) continue

      // If they are online and we haven't notified for them yet this session
      if (isUserOnline(friend.id) && !notifiedUserIds.has(friend.id)) {
        markNotified(friend.id)
        playFriendOnlineSound()

        showUserToast({
          avatar: friend.avatar,
          initials: friend.username.slice(0, 2).toUpperCase(),
          title: `${friend.username} is online!`,
          subtitle: 'Your new friend is ready to chat',
          onClick: () => {
            handleSelectConversationRef.current(-friend.id)
            open()
          },
          duration: 4000,
        })
      }
      checkedFriendIdsRef.current.add(friend.id)
    }
  }, [
    friends,
    friendsLoaded,
    isUserOnline,
    notifiedUserIds,
    markNotified,
    playFriendOnlineSound,
    open,
  ])

  // Requirement: Auto-reconnect and re-subscribe to all rooms in OpenRooms
  // We'll also keep JOINED to all conversations for unread counts OR just use openConversationIds?
  // User says: "closing a tab unsubscribes from that room (and removes it from OpenRooms)"
  // This implies we ONLY stay joined to OpenRooms.

  useEffect(() => {
    // Join all currently "open" rooms
    for (const id of openConversationIds) {
      joinRoom(id)
    }

    // When this effect cleans up, we don't necessarily want to leave all rooms
    // unless the entire component is unmounting.
    // BUT we specifically want to leave rooms that are REMOVED from openConversationIds.
  }, [openConversationIds, joinRoom])

  // Track previously open IDs to know which ones were removed
  const prevOpenIdsRef = useRef<number[]>([])
  useEffect(() => {
    const removedIds = prevOpenIdsRef.current.filter(
      (id: number) => !openConversationIds.includes(id)
    )
    for (const id of removedIds) {
      leaveRoom(id)
    }
    prevOpenIdsRef.current = openConversationIds
  }, [openConversationIds, leaveRoom])

  useEffect(() => {
    if (!activeConversationId) return
    if (!isOpen || minimized) return
    clearUnread(activeConversationId)
  }, [activeConversationId, isOpen, minimized, clearUnread])

  // Typing indicators subscription
  useEffect(() => {
    const unsub = subscribeOnTyping(
      (convId, userId, username, isTyping, expiresInMs) => {
        if (userId === currentUser?.id) return

        setTypingState(prev => {
          const next = { ...prev }
          const roomTyping = { ...(next[convId] || {}) }

          if (isTyping) {
            roomTyping[userId] = {
              username,
              expires: Date.now() + (expiresInMs || 5000),
            }
          } else {
            delete roomTyping[userId]
          }

          if (Object.keys(roomTyping).length === 0) {
            delete next[convId]
          } else {
            next[convId] = roomTyping
          }
          return next
        })
      }
    )

    const interval = setInterval(() => {
      const now = Date.now()
      setTypingState(prev => {
        const next = { ...prev }
        let changed = false
        for (const convId of Object.keys(next)) {
          const cid = Number(convId)
          const roomTyping = { ...next[cid] }
          let roomChanged = false
          for (const userId of Object.keys(roomTyping)) {
            const uid = Number(userId)
            if (roomTyping[uid].expires < now) {
              delete roomTyping[uid]
              roomChanged = true
            }
          }
          if (roomChanged) {
            changed = true
            if (Object.keys(roomTyping).length === 0) {
              delete next[cid]
            } else {
              next[cid] = roomTyping
            }
          }
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [currentUser?.id, subscribeOnTyping])

  // Register message callback: increment unread and show toast for friend DMs only.
  useEffect(() => {
    const handleMessage = (message: Message, conversationId: number) => {
      if (message.sender_id === currentUser?.id) return

      // Determine if this is a friend DM.
      // Either we already have the conversation in our list, or the sender is a friend.
      const isFriendDM =
        friendDMConversationIds.has(conversationId) ||
        friendUserIds.has(message.sender_id)

      if (!isFriendDM) return

      // Chat.tsx owns unread transitions while user is in Messages view.
      if (isMessagesRoute) return

      const state = useChatDockStore.getState()

      // Suppress if user is viewing this conversation on the Chat page
      if (state.activePageConversationId === conversationId) return

      // Update unread count if it's not the currently active & visible dock conversation
      const isCurrentActive =
        conversationId === state.activeConversationId &&
        state.isOpen &&
        !state.minimized

      let newUnreadCount = 0
      if (!isCurrentActive) {
        newUnreadCount = incrementUnread(conversationId)
        // Mirror into the persisted store so the badge survives a page reload.
        useChatDockStore.getState().incrementUnread(conversationId)

        const conv = friendDMConversations.find(c => c.id === conversationId)
        if (
          newUnreadCount === 1 &&
          shouldPlayFriendDMInMessagesView(
            conv ? { ...conv, is_friend_dm: friendsLoaded } : undefined,
            isMessagesRoute,
            newUnreadCount - 1
          )
        ) {
          playNewMessageSound()
        }
      }

      // Show toast if dock is closed, minimized, or viewing a different conversation
      const shouldShowToast =
        !state.isOpen ||
        state.minimized ||
        state.activeConversationId !== conversationId

      if (shouldShowToast) {
        const conv = friendDMConversations.find(c => c.id === conversationId)
        const friend = friends.find(f => f.id === message.sender_id)

        const conversationName = conv
          ? getDirectMessageName(conv, currentUser?.id)
          : friend
            ? friend.username
            : 'New Message'

        const avatar = conv
          ? getDirectMessageAvatar(conv, currentUser?.id)
          : friend?.avatar

        showUserToast({
          avatar,
          initials: conversationName.slice(0, 2).toUpperCase(),
          title: conversationName,
          subtitle: message.content,
          onClick: () => {
            setActiveConversation(conversationId)
            open()
          },
        })
      }
    }

    const unsub = subscribeOnMessage(handleMessage)
    return () => unsub()
  }, [
    currentUser?.id,
    friends,
    friendUserIds,
    friendDMConversations,
    friendDMConversationIds,
    friendsLoaded,
    incrementUnread,
    isMessagesRoute,
    playNewMessageSound,
    subscribeOnMessage,
    open,
    setActiveConversation,
  ])

  // Keyboard shortcuts: Cmd/Ctrl+K toggle, Escape close (when not typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (isTyping) return

      if (e.key === 'Escape') {
        if (isOpen && !minimized) {
          e.preventDefault()
          close()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, minimized, close, toggle])

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (activeConversationId) {
        ctxSendTyping(activeConversationId, isTyping)
      }
    },
    [activeConversationId, ctxSendTyping]
  )

  // Sum every entry in unreadByConversation. incrementUnread is only called for
  // friend DMs so all entries here are legitimate unread counts; this also fixes
  // the timing window where a new conversation's real ID is not yet present in
  // friendDMConversations (virtual vs real ID mismatch).
  const totalUnread = useMemo(
    () => Object.values(unreadByConversation).reduce((sum, n) => sum + n, 0),
    [unreadByConversation]
  )

  const handleSelectConversation = useCallback(
    (id: number | null) => {
      if (id !== null && id < 0) {
        // Virtual conversation, create it
        const friendId = -id
        createConversation(
          { participant_ids: [friendId] },
          {
            onSuccess: (conv: Conversation) => {
              setActiveConversation(conv.id)
              clearUnread(conv.id)
            },
          }
        )
      } else {
        setActiveConversation(id)
        if (id !== null) {
          clearUnread(id)
        }
      }
    },
    [clearUnread, createConversation, setActiveConversation]
  )
  // Keep the ref current on every render so toast onClick closures always invoke
  // the latest version without needing it in their effect dependency arrays.
  handleSelectConversationRef.current = handleSelectConversation

  const conversationName = useMemo(() => {
    if (!activeConversationId) return 'Friends'
    const conv = friendDMConversations.find(c => c.id === activeConversationId)
    if (!conv) return 'Friends'
    return getDirectMessageName(conv, currentUser?.id)
  }, [activeConversationId, friendDMConversations, currentUser?.id])

  const activeTypingUsers = useMemo(() => {
    if (!activeConversationId || !typingState[activeConversationId]) return []
    return Object.values(typingState[activeConversationId]).map(u => u.username)
  }, [activeConversationId, typingState])

  useEffect(() => {
    if (isMobile || !isOpen || minimized) return
    const raf = window.requestAnimationFrame(updatePanelSide)
    return () => window.cancelAnimationFrame(raf)
  }, [dockPos, isMobile, isOpen, minimized, updatePanelSide])

  useEffect(() => {
    if (isMobile || !isOpen || minimized) return
    const handleResize = () => updatePanelSide()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isMobile, isOpen, minimized, updatePanelSide])

  return (
    <>
      {/* Desktop: button + panel share a single fixed wrapper so dragging moves both */}
      {!isMobile && (
        // biome-ignore lint/a11y/noStaticElementInteractions: this container captures mouse drag gestures for dock positioning
        <div
          ref={wrapperRef}
          onMouseDown={handleDragStart}
          onDoubleClick={handleDragReset}
          className={cn('fixed z-60', !dockPos && 'bottom-6 left-6')}
          style={dockPos ? { left: dockPos.x, top: dockPos.y } : undefined}
        >
          {/* Panel: absolutely above the button when open */}
          {isOpen && !minimized && (
            <div
              ref={panelRef}
              className={cn(
                'absolute bottom-full mb-2 flex h-125 w-95 flex-col rounded-xl border border-border bg-background shadow-2xl 2xl:h-150 2xl:w-105',
                panelSide === 'left' ? 'left-0' : 'right-0'
              )}
            >
              <ChatDockPanelContent
                view={view}
                conversationName={conversationName}
                conversations={friendDMConversations}
                activeConversationId={activeConversationId}
                openConversationIds={openConversationIds}
                activeConversation={activeConversation}
                currentUserId={currentUser?.id}
                typingUsers={activeTypingUsers}
                onMinimize={minimize}
                onClose={close}
                onSelectConversation={handleSelectConversation}
                onRemoveConversation={removeOpenConversation}
                onClearAll={clearOpenConversations}
                sendTyping={sendTyping}
                unreadByConversation={unreadByConversation}
                isDraggable
              />
            </div>
          )}

          {/* Floating button */}
          <button
            type='button'
            aria-label='Open messages'
            onClick={handleButtonClick}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95',
              totalUnread > 0 &&
                'animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.5)]'
            )}
          >
            <MessageCircle className='h-5 w-5' />
            {totalUnread > 0 && (
              <span
                data-testid='chat-dock-unread-badge'
                className='absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground'
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Mobile: full-screen sheet dialog */}
      {isMobile && isOpen && !minimized && (
        <Dialog
          open={isOpen && !minimized}
          onOpenChange={open => {
            if (!open) close()
          }}
        >
          <DialogContent
            className={cn(
              'bottom-0 left-0 right-0 top-auto z-60 flex h-[90dvh] max-h-[90dvh] translate-x-0 translate-y-0 flex-col gap-0 rounded-t-xl border-t p-0',
              'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
              '[&>button]:hidden'
            )}
            aria-describedby={undefined}
          >
            <DialogTitle className='sr-only'>Friends</DialogTitle>
            <ChatDockPanelContent
              view={view}
              conversationName={conversationName}
              conversations={friendDMConversations}
              activeConversationId={activeConversationId}
              openConversationIds={openConversationIds}
              activeConversation={activeConversation}
              currentUserId={currentUser?.id}
              typingUsers={activeTypingUsers}
              onMinimize={minimize}
              onClose={close}
              onSelectConversation={handleSelectConversation}
              onRemoveConversation={removeOpenConversation}
              onClearAll={clearOpenConversations}
              sendTyping={sendTyping}
              unreadByConversation={unreadByConversation}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
