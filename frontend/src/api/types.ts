// API Types - matching your Go backend

export interface User {
  id: number
  username: string
  email: string
  bio?: string
  avatar?: string
  created_at: string
  updated_at: string
}

export interface Post {
  id: number
  title: string
  content: string
  image_url?: string
  likes: number
  user_id: number
  user?: User
  created_at: string
  updated_at: string
}

export interface Comment {
  id: number
  content: string
  post_id: number
  user_id: number
  user?: User
  created_at: string
  updated_at: string
}

// Request/Response types
export interface SignupRequest {
  username: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface CreatePostRequest {
  title: string
  content: string
  image_url?: string
}

export interface UpdatePostRequest {
  title?: string
  content?: string
  image_url?: string
}

export interface CreateCommentRequest {
  content: string
}

export interface UpdateCommentRequest {
  content: string
}

export interface UpdateProfileRequest {
  username?: string
  bio?: string
  avatar?: string
}

export interface PaginationParams {
  offset?: number
  limit?: number
}

export interface SearchParams extends PaginationParams {
  q: string
}

export interface ApiError {
  error: string
}
