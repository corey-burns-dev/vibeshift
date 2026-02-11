/**
 * Shared test utilities: custom render, mock factories, and helpers.
 * Use these in unit tests for consistent setup and test data.
 */
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  type RenderOptions,
  render as rtlRender,
  renderHook as rtlRenderHook,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type {
  Comment,
  Conversation,
  FriendRequest,
  Message,
  Post,
  SanctumDTO,
  SanctumRequest,
  User,
} from '@/api/types'

import {
  createTestQueryClient as baseCreateTestQueryClient,
  renderWithProviders,
} from './renderWithProviders'

export { renderWithProviders }
export const createTestQueryClient = baseCreateTestQueryClient

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  queryClient?: QueryClient
}

export function render(ui: ReactElement, options: CustomRenderOptions = {}) {
  const {
    route = '/',
    queryClient = createTestQueryClient(),
    ...rest
  } = options

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    ...rtlRender(ui, { wrapper: Wrapper, ...rest }),
    queryClient,
  }
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: {
    route?: string
    queryClient?: QueryClient
    wrapper?: React.ComponentType<{ children: ReactNode }>
  } = {}
) {
  const {
    route = '/',
    queryClient = createTestQueryClient(),
    wrapper: CustomWrapper,
  } = options

  function Wrapper({ children }: { children: ReactNode }) {
    const inner = (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
    return CustomWrapper ? <CustomWrapper>{inner}</CustomWrapper> : inner
  }

  return rtlRenderHook(hook, { wrapper: Wrapper })
}

// --- Mock factories (builders for API types) ---

const now = () => new Date().toISOString()

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }
}

export function buildMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    conversation_id: 1,
    sender_id: 1,
    content: 'Hello',
    message_type: 'text',
    is_read: false,
    created_at: now(),
    updated_at: now(),
    sender: buildUser({ id: 1 }),
    ...overrides,
  }
}

export function buildConversation(
  overrides: Partial<Conversation> = {}
): Conversation {
  return {
    id: 1,
    is_group: false,
    created_by: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }
}

export function buildSanctum(overrides: Partial<SanctumDTO> = {}): SanctumDTO {
  return {
    id: 1,
    name: 'Test Sanctum',
    slug: 'test-sanctum',
    description: 'A test sanctum',
    status: 'active',
    default_chat_room_id: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }
}

export function buildSanctumRequest(
  overrides: Partial<SanctumRequest> = {}
): SanctumRequest {
  return {
    id: 1,
    requested_by_user_id: 1,
    requested_name: 'New Sanctum',
    requested_slug: 'new-sanctum',
    reason: 'Testing',
    status: 'pending',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }
}

export function buildPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    title: 'Test Post',
    content: 'Content',
    likes_count: 0,
    user_id: 1,
    created_at: now(),
    updated_at: now(),
    user: buildUser({ id: 1 }),
    ...overrides,
  }
}

export function buildComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    content: 'A comment',
    post_id: 1,
    user_id: 1,
    created_at: now(),
    updated_at: now(),
    user: buildUser({ id: 1 }),
    ...overrides,
  }
}

export function buildFriendRequest(
  overrides: Partial<FriendRequest> = {}
): FriendRequest {
  return {
    id: 1,
    sender_id: 1,
    receiver_id: 2,
    status: 'pending',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }
}

// --- Helpers ---

export function createLocalStorageMock(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
}

export function setAuthInStorage(
  storage: Storage,
  token: string,
  user: { id: number; username: string; email?: string; is_admin?: boolean }
) {
  storage.setItem('token', token)
  storage.setItem('user', JSON.stringify(user))
}
