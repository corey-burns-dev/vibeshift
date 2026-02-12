# API & Hooks Architecture

## Overview

This project uses **TanStack Query (React Query)** for all server state management, with a clean separation between:

- **API Client** (`src/api/client.ts`) - HTTP request logic
- **Type Definitions** (`src/api/types.ts`) - TypeScript interfaces
- **Custom Hooks** (`src/hooks/*`) - React Query wrappers

## File Structure

```
frontend/src/
├── api/
│   ├── client.ts       # API client with fetch wrapper
│   └── types.ts        # TypeScript types matching Go backend
├── hooks/
│   ├── index.ts        # Export all hooks
│   ├── useAuth.ts      # Authentication: signup, login, logout
│   ├── useComments.ts  # Comment operations with optimistic updates
│   ├── usePosts.ts     # Post operations with infinite scroll
│   └── useUsers.ts     # User profile management
└── pages/
    ├── Login.tsx       # Updated to use useLogin hook
    └── Signup.tsx      # Updated to use useSignup hook
```

## Environment Variables

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8375/api
```

## API Client

The `apiClient` provides typed methods for all backend endpoints:

```typescript
import { apiClient } from '@/api/client'

// All methods return promises and handle auth automatically
await apiClient.getPosts({ limit: 10, offset: 0 })
await apiClient.createPost({ title: 'Hello', content: 'World' })
await apiClient.likePost(postId)
```

### Features

- ✅ Automatic JWT token injection from localStorage
- ✅ Centralized error handling
- ✅ Type-safe requests/responses
- ✅ Environment-based URL configuration

## Custom Hooks

### Authentication (`useAuth.ts`)

```typescript
import { useSignup, useLogin, useLogout } from '@/hooks'

// Signup
const signup = useSignup()
signup.mutate({ username, email, password })

// Login
const login = useLogin()
login.mutate({ email, password })

// Logout
const logout = useLogout()
logout() // Clears storage and cache
```

### Posts (`usePosts.ts`)

```typescript
import {
  usePosts,           // Paginated list
  useInfinitePosts,   // Infinite scroll
  usePost,            // Single post
  useSearchPosts,     // Search
  useCreatePost,      // Create
  useUpdatePost,      // Update with optimistic updates
  useDeletePost,      // Delete
  useLikePost,        // Like with optimistic updates
} from '@/hooks'

// Get posts
const { data, isLoading, error } = usePosts({ limit: 10 })

// Infinite scroll
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfinitePosts(10)

// Create post
const createPost = useCreatePost()
createPost.mutate({ title: 'New Post', content: 'Content' })

// Like with optimistic UI update
const likePost = useLikePost(postId)
likePost.mutate() // Likes count updates instantly
```

### Comments (`useComments.ts`)

```typescript
import {
  usePostComments,    // Get comments for a post
  useCreateComment,   // Create comment
  useUpdateComment,   // Update with optimistic updates
  useDeleteComment,   // Delete with optimistic updates
} from '@/hooks'

const { data: comments } = usePostComments(postId)

const createComment = useCreateComment(postId)
createComment.mutate({ content: 'Great post!' })
```

### Users (`useUsers.ts`)

```typescript
import {
  useMyProfile,       // Get current user
  useUserProfile,     // Get user by ID
  useUpdateMyProfile, // Update profile with optimistic updates
  getCurrentUser,     // Sync helper (from localStorage)
  useIsAuthenticated, // Check auth status
} from '@/hooks'

const { data: profile } = useMyProfile()
const { data: user } = useUserProfile(userId)

const updateProfile = useUpdateMyProfile()
updateProfile.mutate({ bio: 'New bio', avatar: 'url' })

// Synchronous helpers
const currentUser = getCurrentUser()
const isAuth = useIsAuthenticated()
```

## Key Features

### 1. Optimistic Updates

Posts, comments, and profile updates show changes immediately before server confirmation:

```typescript
// UI updates instantly, rolls back on error
likePost.mutate() // Likes count increases immediately
```

### 2. Automatic Cache Invalidation

Mutations automatically refresh related data:

```typescript
createPost.mutate(data) // Automatically refetches post lists
deleteComment.mutate(id) // Automatically refetches comments
```

### 3. Query Keys Pattern

Organized cache keys for precise invalidation:

```typescript
postKeys.all          // ['posts']
postKeys.lists()      // ['posts', 'list']
postKeys.list(params) // ['posts', 'list', { limit: 10 }]
postKeys.detail(1)    // ['posts', 'detail', 1]
```

### 4. Error Handling

All hooks expose loading and error states:

```typescript
const { data, isLoading, error } = usePosts()

if (isLoading) return <Loader />
if (error) return <Error message={error.message} />
```

### 5. Type Safety

Full TypeScript coverage from API to UI:

```typescript
// Types are inferred automatically
const { data } = usePosts() // data: Post[] | undefined
const post = usePost(1)     // post: Post | undefined
```

## Usage Examples

See `docs/hooks-usage-examples.tsx` for complete component examples including:

- Simple posts list
- Infinite scroll implementation
- Create post form
- Post card with like/delete actions

## Migration Guide

### Before (manual fetch)

```typescript
const [posts, setPosts] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  fetch('http://localhost:8375/api/posts')
    .then(res => res.json())
    .then(setPosts)
    .finally(() => setLoading(false))
}, [])
```

### After (with hooks)

```typescript
const { data: posts, isLoading } = usePosts()
// That's it! Handles caching, refetching, errors automatically
```

## Best Practices

1. **Use hooks at component level**, not in event handlers
2. **Leverage optimistic updates** for better UX
3. **Handle loading/error states** consistently
4. **Use query keys** for precise cache invalidation
5. **Prefer infinite scroll** for long lists (`useInfinitePosts`)
6. **Check authentication** with `useIsAuthenticated()` for protected routes

## Testing

All hooks are testable with `@tanstack/react-query` test utils:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePosts } from '@/hooks'

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

test('usePosts returns data', async () => {
  const { result } = renderHook(() => usePosts(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBeDefined()
})
```

## Next Steps

1. ✅ **Implemented**: API client, types, and all hooks
2. ✅ **Updated**: Login and Signup pages to use hooks
3. 🔜 **TODO**: Create Posts feed page using `useInfinitePosts`
4. 🔜 **TODO**: Add React Router route guards for auth
5. 🔜 **TODO**: Implement form validation with Zod/React Hook Form
6. 🔜 **TODO**: Add error boundaries for query errors
7. 🔜 **TODO**: Set up React Query DevTools in development
