import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const CHAT_DOCK_STORAGE_PREFIX = 'chat-dock-storage'
const CHAT_DOCK_STORAGE_ANON = 'anon'

type ChatDockStorageUserID = number | null | undefined

function normalizeUserID(userID: ChatDockStorageUserID): number | null {
  return typeof userID === 'number' && Number.isFinite(userID) ? userID : null
}

export function getChatDockStorageKey(userID?: ChatDockStorageUserID): string {
  const normalized = normalizeUserID(userID)
  return `${CHAT_DOCK_STORAGE_PREFIX}:${normalized ?? CHAT_DOCK_STORAGE_ANON}`
}

function getCurrentUserIDFromStorage(): number | null {
  try {
    if (typeof window === 'undefined') return null
    const userStr = localStorage.getItem('user')
    if (!userStr) return null
    const parsed = JSON.parse(userStr)
    return normalizeUserID(parsed?.id)
  } catch {
    return null
  }
}

export function getCurrentChatDockStorageKey(): string {
  return getChatDockStorageKey(getCurrentUserIDFromStorage())
}

const DEFAULT_CHAT_DOCK_STATE = {
  isOpen: false,
  minimized: false,
  view: 'list' as const,
  activeConversationId: null as number | null,
  activePageConversationId: null as number | null,
  openConversationIds: [] as number[],
  drafts: {} as Record<number, string>,
  unreadCounts: {} as Record<number, number>,
  scrollPositions: {} as Record<number, number>,
}

interface ChatDockState {
  isOpen: boolean
  minimized: boolean
  view: 'list' | 'conversation'
  activeConversationId: number | null
  activePageConversationId: number | null
  openConversationIds: number[]
  drafts: Record<number, string>
  unreadCounts: Record<number, number>
  scrollPositions: Record<number, number>

  toggle: () => void
  open: () => void
  close: () => void
  minimize: () => void
  restore: () => void
  setActiveConversation: (id: number | null) => void
  setActivePageConversation: (id: number | null) => void
  addOpenConversation: (id: number) => void
  removeOpenConversation: (id: number) => void
  clearOpenConversations: () => void
  updateDraft: (conversationId: number, text: string) => void
  clearDraft: (conversationId: number) => void
  updateScrollPosition: (conversationId: number, position: number) => void
  incrementUnread: (conversationId: number) => void
  resetUnread: (conversationId: number) => void
  resetUnreadBulk: (conversationIds: number[]) => void
  resetSessionState: () => void
}

export const useChatDockStore = create<ChatDockState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_CHAT_DOCK_STATE,

      toggle: () => {
        const { isOpen, minimized } = get()
        if (isOpen && minimized) {
          set({ minimized: false })
        } else {
          set({ isOpen: !isOpen, minimized: false })
        }
      },

      open: () => set({ isOpen: true, minimized: false }),

      close: () => set({ isOpen: false, minimized: false }),

      minimize: () => set({ minimized: true }),

      restore: () => set({ minimized: false }),

      setActivePageConversation: (id: number | null) =>
        set({ activePageConversationId: id }),

      setActiveConversation: (id: number | null) => {
        if (id === null) {
          set({ activeConversationId: null, view: 'list' })
        } else {
          set(state => {
            const openIds = state.openConversationIds.includes(id)
              ? state.openConversationIds
              : [...state.openConversationIds, id]
            return {
              activeConversationId: id,
              openConversationIds: openIds,
              view: 'conversation',
              unreadCounts: { ...state.unreadCounts, [id]: 0 },
            }
          })
        }
      },

      addOpenConversation: (id: number) =>
        set(state => ({
          openConversationIds: state.openConversationIds.includes(id)
            ? state.openConversationIds
            : [...state.openConversationIds, id],
        })),

      removeOpenConversation: (id: number) =>
        set(state => {
          const nextOpenIds = state.openConversationIds.filter(
            openId => openId !== id
          )
          const nextActiveId =
            state.activeConversationId === id
              ? nextOpenIds.length > 0
                ? nextOpenIds[nextOpenIds.length - 1]
                : null
              : state.activeConversationId

          return {
            openConversationIds: nextOpenIds,
            activeConversationId: nextActiveId,
            view: nextActiveId ? 'conversation' : 'list',
          }
        }),

      clearOpenConversations: () =>
        set({
          openConversationIds: [],
          activeConversationId: null,
          view: 'list',
        }),

      updateDraft: (conversationId: number, text: string) =>
        set(state => ({
          drafts: { ...state.drafts, [conversationId]: text },
        })),

      clearDraft: (conversationId: number) =>
        set(state => {
          const { [conversationId]: _, ...rest } = state.drafts
          return { drafts: rest }
        }),

      updateScrollPosition: (conversationId: number, position: number) =>
        set(state => ({
          scrollPositions: {
            ...state.scrollPositions,
            [conversationId]: position,
          },
        })),

      incrementUnread: (conversationId: number) =>
        set(state => ({
          unreadCounts: {
            ...state.unreadCounts,
            [conversationId]: (state.unreadCounts[conversationId] || 0) + 1,
          },
        })),

      resetUnread: (conversationId: number) =>
        set(state => ({
          unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
        })),

      resetUnreadBulk: (conversationIds: number[]) =>
        set(state => {
          const next = { ...state.unreadCounts }
          for (const id of conversationIds) {
            next[id] = 0
          }
          return { unreadCounts: next }
        }),
      resetSessionState: () => set({ ...DEFAULT_CHAT_DOCK_STATE }),
    }),
    {
      // Namespace persisted key by user id to avoid cross-account leaks.
      name: getCurrentChatDockStorageKey(),
      partialize: state => ({
        activeConversationId: state.activeConversationId,
        openConversationIds: state.openConversationIds,
        drafts: state.drafts,
        unreadCounts: state.unreadCounts,
        scrollPositions: state.scrollPositions,
      }),
    }
  )
)

interface ResetChatDockSessionOptions {
  previousUserID?: ChatDockStorageUserID
  nextUserID?: ChatDockStorageUserID
  clearPersisted?: boolean
}

export function resetChatDockSession(
  options: ResetChatDockSessionOptions = {}
) {
  const previousUserID = normalizeUserID(options.previousUserID)
  const nextUserID = normalizeUserID(options.nextUserID)
  const clearPersisted = options.clearPersisted ?? true

  const previousKey = getChatDockStorageKey(previousUserID)
  const nextKey = getChatDockStorageKey(nextUserID)

  if (clearPersisted && typeof window !== 'undefined') {
    localStorage.removeItem(previousKey)
    if (nextKey !== previousKey) {
      localStorage.removeItem(nextKey)
    }
  }

  useChatDockStore.persist.setOptions({ name: nextKey })
  useChatDockStore.getState().resetSessionState()
  void useChatDockStore.persist.rehydrate()
}
