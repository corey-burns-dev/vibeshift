import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChatDockState {
  isOpen: boolean
  minimized: boolean
  view: 'list' | 'conversation'
  activeConversationId: number | null
  drafts: Record<number, string>
  unreadCounts: Record<number, number>

  toggle: () => void
  open: () => void
  close: () => void
  minimize: () => void
  restore: () => void
  setActiveConversation: (id: number | null) => void
  updateDraft: (conversationId: number, text: string) => void
  clearDraft: (conversationId: number) => void
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
      drafts: {},
      unreadCounts: {},

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

      setActiveConversation: (id: number | null) => {
        if (id === null) {
          set({ activeConversationId: null, view: 'list' })
        } else {
          set(state => ({
            activeConversationId: id,
            view: 'conversation',
            unreadCounts: { ...state.unreadCounts, [id]: 0 },
          }))
        }
      },

      updateDraft: (conversationId: number, text: string) =>
        set(state => ({
          drafts: { ...state.drafts, [conversationId]: text },
        })),

      clearDraft: (conversationId: number) =>
        set(state => {
          const { [conversationId]: _, ...rest } = state.drafts
          return { drafts: rest }
        }),

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
        drafts: state.drafts,
        unreadCounts: state.unreadCounts,
      }),
    }
  )
)
