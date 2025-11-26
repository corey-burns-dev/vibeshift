# Quick Reference: API Hooks

## Auth Hooks

| Hook | Purpose | Usage |
|------|---------|-------|
| `useSignup()` | Register user | `signup.mutate({ username, email, password })` |
| `useLogin()` | Login user | `login.mutate({ email, password })` |
| `useLogout()` | Logout | `const logout = useLogout(); logout()` |

## Post Hooks

| Hook | Purpose | Returns |
|------|---------|---------|
| `usePosts(params?)` | Get paginated posts | `{ data: Post[], isLoading, error }` |
| `useInfinitePosts(limit)` | Infinite scroll | `{ data, fetchNextPage, hasNextPage }` |
| `usePost(id)` | Get single post | `{ data: Post, isLoading, error }` |
| `useSearchPosts(params)` | Search posts | `{ data: Post[], isLoading, error }` |
| `useCreatePost()` | Create post | `mutation.mutate({ title, content })` |
| `useUpdatePost(id)` | Update post | `mutation.mutate({ title, content })` |
| `useDeletePost()` | Delete post | `mutation.mutate(postId)` |
| `useLikePost(id)` | Like post | `mutation.mutate()` |

## Comment Hooks

| Hook | Purpose | Usage |
|------|---------|-------|
| `usePostComments(postId)` | Get comments | `{ data: Comment[], isLoading, error }` |
| `useCreateComment(postId)` | Create comment | `mutation.mutate({ content })` |
| `useUpdateComment(postId, commentId)` | Update comment | `mutation.mutate({ content })` |
| `useDeleteComment(postId)` | Delete comment | `mutation.mutate(commentId)` |

## User Hooks

| Hook | Purpose | Usage |
|------|---------|-------|
| `useMyProfile()` | Get current user | `{ data: User, isLoading, error }` |
| `useUserProfile(id)` | Get user by ID | `{ data: User, isLoading, error }` |
| `useUpdateMyProfile()` | Update profile | `mutation.mutate({ bio, avatar })` |
| `getCurrentUser()` | Sync get user | `const user = getCurrentUser()` |
| `useIsAuthenticated()` | Check auth | `const isAuth = useIsAuthenticated()` |

## Common Patterns

### Loading State

```typescript
const { data, isLoading, error } = usePosts()

if (isLoading) return <Spinner />
if (error) return <Error message={error.message} />
return <PostsList posts={data} />
```

### Mutation

```typescript
const createPost = useCreatePost()

const handleSubmit = async () => {
  try {
    await createPost.mutateAsync({ title, content })
    // Success!
  } catch (error) {
    // Handle error
  }
}

// Or simpler:
createPost.mutate({ title, content })
```

### Optimistic UI

```typescript
// Likes update instantly, rolls back on error
const likePost = useLikePost(postId)
<button onClick={() => likePost.mutate()}>
  Like ({post.likes})
</button>
```

### Infinite Scroll

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePosts(10)

return (
  <>
    {data?.pages.map(page => 
      page.map(post => <Post key={post.id} {...post} />)
    )}
    {hasNextPage && (
      <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
        Load More
      </button>
    )}
  </>
)
```

## API Client (Direct Use)

```typescript
import { apiClient } from '@/api'

// Use directly if needed (hooks are preferred)
const posts = await apiClient.getPosts({ limit: 10 })
const post = await apiClient.createPost({ title, content })
```

## Environment

```env
# frontend/.env
VITE_API_URL=http://localhost:8080/api
```

## Types

All types exported from `@/api/types`:

- `User`, `Post`, `Comment`
- `SignupRequest`, `LoginRequest`, `AuthResponse`
- `CreatePostRequest`, `UpdatePostRequest`
- `CreateCommentRequest`, `UpdateCommentRequest`
- `UpdateProfileRequest`
- `PaginationParams`, `SearchParams`
