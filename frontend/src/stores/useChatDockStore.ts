import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
}

export const useChatDockStore = create<ChatDockState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      minimized: false,
      view: 'list',
      activeConversationId: null,
      activePageConversationId: null,
      openConversationIds: [],
      drafts: {},
      unreadCounts: {},
      scrollPositions: {},

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
    }),
    {
      // Namespace persisted key by current user id to avoid cross-account leaks
      name: (() => {
        try {
          if (typeof window === 'undefined') return 'chat-dock-storage:anon'
          const userStr = localStorage.getItem('user')
          if (!userStr) return 'chat-dock-storage:anon'
          const u = JSON.parse(userStr)
          return `chat-dock-storage:${u?.id ?? 'anon'}`
        } catch {
          return 'chat-dock-storage:anon'
        }
      })(),
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
