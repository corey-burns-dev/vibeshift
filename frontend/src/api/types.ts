// API Types - matching your Go backend

export interface User {
  id: number
  username: string
  email: string
  bio?: string
  avatar?: string
  is_admin?: boolean
  is_banned?: boolean
  banned_at?: string
  banned_reason?: string
  banned_by_user_id?: number
  created_at: string
  liked?: boolean
  updated_at: string
}

export type PostType = 'text' | 'media' | 'video' | 'link' | 'poll'

export interface PollOption {
  id: number
  poll_id: number
  option_text: string
  display_order: number
  votes_count?: number
}

export interface Poll {
  id: number
  post_id: number
  question: string
  options: PollOption[]
  user_vote_option_id?: number
}

export interface UploadedImage {
  id: number
  hash: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  crop_mode: 'square' | 'portrait' | 'landscape' | 'free'
  url: string
  variants: Record<string, string>
  width: number
  height: number
  size_bytes: number
  mime_type: string
}

export interface Post {
  id: number
  title: string
  content: string
  image_url?: string
  image_variants?: Record<string, string>
  image_crop_mode?: string
  post_type?: PostType
  link_url?: string
  youtube_url?: string
  poll?: Poll
  likes_count: number
  liked?: boolean
  comments_count?: number
  user_id: number
  sanctum_id?: number
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

export interface CreatePostPollInput {
  question: string
  options: string[]
}

export interface CreatePostRequest {
  title: string
  content: string
  image_url?: string
  post_type?: PostType
  link_url?: string
  youtube_url?: string
  sanctum_id?: number
  poll?: CreatePostPollInput
}

export interface UpdatePostRequest {
  title?: string
  content?: string
  image_url?: string
  link_url?: string
  youtube_url?: string
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
  sanctum_id?: number
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
  capabilities?: ChatroomCapabilities
}

export interface ChatroomCapabilities {
  can_moderate: boolean
  can_manage_moderators: boolean
}

export interface ChatroomModerator {
  conversation_id: number
  user_id: number
  granted_by_user_id: number
  created_at: string
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
  read_at?: string
  reactions?: MessageReaction[]
  reaction_summary?: MessageReactionSummary[]
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface MessageReaction {
  id: number
  message_id: number
  user_id: number
  emoji: string
  created_at: string
  user?: User
}

export interface MessageReactionSummary {
  emoji: string
  count: number
  reacted_by_me: boolean
}

export interface MessageReactionResponse {
  conversation_id: number
  message_id: number
  reactions: MessageReactionSummary[]
}

export interface MessageMention {
  id: number
  message_id: number
  conversation_id: number
  mentioned_user_id: number
  mentioned_by_user_id: number
  created_at: string
  read_at?: string
  message?: Message
  conversation?: Conversation
  mentioned_user?: User
  mentioned_by_user?: User
}

export interface UserBlock {
  id: number
  blocker_id: number
  blocked_id: number
  created_at: string
  blocker?: User
  blocked?: User
}

export interface ReportRequest {
  reason: string
  details?: string
}

export type ModerationReportTargetType = 'post' | 'message' | 'user'
export type ModerationReportStatus = 'open' | 'resolved' | 'dismissed'

export interface ModerationReport {
  id: number
  reporter_id: number
  target_type: ModerationReportTargetType
  target_id: number
  reported_user_id?: number
  reason: string
  details: string
  status: ModerationReportStatus
  resolved_by_user_id?: number
  resolved_at?: string
  resolution_note: string
  created_at: string
  updated_at: string
  reporter?: User
  reported_user?: User
  resolved_by_user?: User
}

export interface ResolveModerationReportRequest {
  status: Exclude<ModerationReportStatus, 'open'>
  resolution_note?: string
}

export interface AdminBanRequest {
  reported_user_id: number
  report_count: number
  latest_report_at: string
  user: User
}

export interface ChatroomMute {
  id: number
  conversation_id: number
  user_id: number
  muted_by_user_id: number
  reason: string
  muted_until?: string
  created_at: string
  updated_at: string
  user?: User
  muted_by_user?: User
}

export interface ChatroomBan {
  conversation_id: number
  user_id: number
  banned_by_user_id: number
  reason: string
  created_at: string
  updated_at: string
  user?: User
  banned_by_user?: User
}

export interface MuteChatroomUserRequest {
  reason?: string
  muted_until?: string
}

export interface BanUserRequest {
  reason?: string
}

export interface AdminUserDetailResponse {
  user: User
  reports: ModerationReport[]
  active_mutes: ChatroomMute[]
  blocks_given: UserBlock[]
  blocks_received: UserBlock[]
  warnings?: string[]
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
  creator_id?: number
  opponent_id?: number
  winner_id?: number
  is_draw: boolean
  next_turn_id: number
  current_state: string
  creator?: User
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
  requested_by_user_id: number
  requested_by_user?: User
  requested_name: string
  requested_slug: string
  reason: string
  status: SanctumRequestStatus
  review_notes?: string
  reviewed_by_user_id?: number
  reviewed_by_user?: User
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

export interface SanctumAdmin {
  user_id: number
  username: string
  email: string
  role: 'owner' | 'mod' | 'member'
  created_at: string
  updated_at: string
}

export interface BulkSanctumMembershipsInput {
  sanctum_slugs: string[]
}
