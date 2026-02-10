// API Types - matching your Go backend

export interface User {
  id: number
  username: string
  email: string
  bio?: string
  avatar?: string
  is_admin?: boolean
  created_at: string
  liked?: boolean
  updated_at: string
}

export interface Post {
  id: number
  title: string
  content: string
  image_url?: string
  likes_count: number
  liked?: boolean
  comments_count?: number
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

export interface FriendRequest {
  id: number
  sender_id: number
  receiver_id: number
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  updated_at: string
  sender?: User
  receiver?: User
}

export interface FriendshipStatus {
  status: 'none' | 'pending_sent' | 'pending_received' | 'friends'
  request_id?: number
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

export interface ApiErrorResponse {
  error: string
}

// Chat types
export interface Conversation {
  id: number
  is_group: boolean
  name?: string
  avatar?: string
  created_by: number
  created_at: string
  updated_at: string
  last_message?: Message
  participants?: User[]
  unread_count?: number
  is_joined?: boolean
}

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  sender?: User
  content: string
  message_type: 'text' | 'image' | 'file'
  metadata?: Record<string, unknown>
  is_read: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface CreateConversationRequest {
  participant_ids: number[]
  is_group?: boolean
  name?: string
  avatar?: string
}

export interface SendMessageRequest {
  content: string
  message_type?: 'text' | 'image' | 'file'
  // Backend expects a JSON object
  metadata?: Record<string, unknown>
}

// Game types (match backend models/game.go)
export interface GameRoom {
  id: number
  type: string
  status: string
  creator_id: number
  opponent_id?: number
  winner_id?: number
  is_draw: boolean
  next_turn_id: number
  current_state: string
  creator: User
  opponent?: User
}

// Stream types
export interface Stream {
  id: number
  user_id: number
  user?: User
  title: string
  description?: string
  thumbnail_url?: string
  stream_url: string
  stream_type: 'youtube' | 'twitch' | 'hls' | 'iframe'
  is_live: boolean
  viewer_count: number
  category?: string
  tags?: string
  started_at?: string
  ended_at?: string
  created_at: string
  updated_at: string
}

export interface StreamMessage {
  id: number
  stream_id: number
  user_id: number
  user?: User
  content: string
  created_at: string
}

export interface CreateStreamRequest {
  title: string
  description?: string
  thumbnail_url?: string
  stream_url: string
  stream_type: 'youtube' | 'twitch' | 'hls' | 'iframe'
  category?: string
  tags?: string
}

export interface UpdateStreamRequest {
  title?: string
  description?: string
  thumbnail_url?: string
  stream_url?: string
  stream_type?: 'youtube' | 'twitch' | 'hls' | 'iframe'
  category?: string
  tags?: string
}

export interface StreamsResponse {
  streams: Stream[]
  total: number
  limit: number
  offset: number
}

export interface SanctumDTO {
  id: number
  name: string
  slug: string
  description: string
  status: string
  default_chat_room_id: number
  created_at: string
  updated_at: string
}

export type SanctumRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SanctumRequest {
  id: number
  user_id: number
  requested_name: string
  requested_slug: string
  reason: string
  status: SanctumRequestStatus
  review_notes?: string
  reviewed_by?: number
  created_at: string
  updated_at: string
}

export interface CreateSanctumRequestInput {
  requested_name: string
  requested_slug: string
  reason: string
}

export type AdminSanctumRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AdminSanctumRequestActionResponse {
  sanctum: SanctumDTO
  request: SanctumRequest
}

export interface SanctumMembership {
  sanctum_id: number
  user_id: number
  role: 'owner' | 'mod' | 'member'
  created_at: string
  updated_at: string
  sanctum: SanctumDTO
}

export interface BulkSanctumMembershipsInput {
  sanctum_slugs: string[]
}
